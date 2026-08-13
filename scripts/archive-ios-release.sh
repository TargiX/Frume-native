#!/bin/sh

set -eu

if [ -n "${NODE_OPTIONS:-}" ] || [ -n "${NODE_PATH:-}" ]; then
  echo "Unset NODE_OPTIONS and NODE_PATH for the iOS release transaction." >&2
  exit 2
fi

# Metro runs later as an Xcode build phase. Export this for the complete
# transaction so a developer .env.local cannot replace reviewed release
# configuration after the clean prebuild has finished.
export EXPO_NO_DOTENV=1

: "${FRUME_DEVELOPMENT_TEAM:?Set the reviewed Apple Developer team ID}"
: "${FRUME_BUILD_NUMBER:?Set the App Store Connect build number}"
: "${EXPO_PUBLIC_PHOTO_API_URL:?Set the verified production Worker URL}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:?Set the RevenueCat iOS public SDK key}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:?Set the reviewed iOS non-consumable product ID}"
: "${EXPO_PUBLIC_PRIVACY_URL:?Set the published privacy-policy URL}"
: "${EXPO_PUBLIC_SUPPORT_URL:?Set the published support URL}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd -P)
workspace="$repo_dir/ios/Frume.xcworkspace"
native_info_plist="$repo_dir/ios/Frume/Info.plist"
compiler_proxy="$script_dir/xcode-clang-proxy.py"
photo_api_url_validator="$script_dir/validate-production-photo-api-url.mjs"
photo_api_health_validator="$script_dir/validate-production-photo-api-health.mjs"
revenuecat_validator="$script_dir/validate-revenuecat-ios-release.mjs"
public_pages_validator="$script_dir/validate-public-release-pages.mjs"
apple_toolchain_validator="$script_dir/validate-apple-toolchain.mjs"
release_revision_validator="$script_dir/validate-release-revision.mjs"
frume_tmp_root=${TMPDIR:-/tmp}
archive_root=${FRUME_ARCHIVE_ROOT:-}
release_source_stage=${FRUME_RELEASE_SOURCE_STAGE:-0}

if [ "$release_source_stage" != "1" ]; then
  # Lightweight preflight keeps configuration errors actionable before remote
  # provenance work. These checks grant no authority to build.
  node "$photo_api_url_validator" || exit 2
  if [ -n "${EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:-}" ]; then
    echo "Unset EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY for an iOS release archive."
    exit 2
  fi
  node "$apple_toolchain_validator" || exit 2
  node "$revenuecat_validator" || exit 2

  if [ -z "${FRUME_REVIEWED_RELEASE_SHA:-}" ]; then
    echo "Set FRUME_REVIEWED_RELEASE_SHA to the full approved origin/main commit SHA." >&2
    exit 2
  fi
  if [ -z "${FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID:-}" ]; then
    echo "Set FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID to the immutable reviewed Worker deployment ID." >&2
    exit 2
  fi

  # Verify live canonical provenance and materialize only the exact remote Git
  # tree. The exporter ignores local filters, excludes, alternate platform
  # files, replace objects, and Git environment overrides.
  release_source_dir=$(mktemp -d "$frume_tmp_root/frume-reviewed-source.XXXXXX")
  release_source_dir=$(CDPATH= cd -- "$release_source_dir" && pwd -P)
  trap 'rm -rf -- "$release_source_dir"' EXIT HUP INT TERM
  release_handoff_path="$release_source_dir/.frume-release-handoff.json"
  if ! release_export_result=$(
    FRUME_REPO_DIR="$repo_dir" \
    FRUME_RELEASE_SOURCE_EXPORT="$release_source_dir" \
    FRUME_RELEASE_HANDOFF_PATH="$release_handoff_path" \
    node "$release_revision_validator"
  ); then
    exit 2
  fi
  echo "$release_export_result"
  exported_tree_manifest=$(node -e '
    const fs = require("node:fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!/^[0-9a-f]{64}$/.test(data.manifestDigest)) process.exit(2);
    process.stdout.write(data.manifestDigest);
  ' "$release_handoff_path") || {
    echo "Reviewed release handoff is invalid." >&2
    exit 2
  }
  if ! canonical_manifest_json=$(
    FRUME_VERIFY_CANONICAL_MANIFEST=1 \
    FRUME_REVIEWED_RELEASE_SHA="$FRUME_REVIEWED_RELEASE_SHA" \
    node "$release_revision_validator"
  ); then
    echo "Canonical release source could not be verified." >&2
    exit 2
  fi
  canonical_tree_manifest=$(printf '%s' "$canonical_manifest_json" | node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const data = JSON.parse(body);
      if (
        data.reviewedSha !== process.argv[1] ||
        !/^[0-9a-f]{64}$/.test(data.manifestDigest)
      ) process.exit(2);
      process.stdout.write(data.manifestDigest);
    });
  ' "$FRUME_REVIEWED_RELEASE_SHA") || {
    echo "Canonical release manifest is invalid." >&2
    exit 2
  }
  if [ "$canonical_tree_manifest" != "$exported_tree_manifest" ]; then
    echo "Exported release tree does not match canonical main." >&2
    exit 2
  fi

  # Transfer control to the script contained in the reviewed remote tree. The
  # long install/check/prebuild/archive transaction never executes orchestration
  # or app code from the mutable invoking checkout.
  exec env \
    FRUME_RELEASE_SOURCE_STAGE=1 \
    FRUME_RELEASE_SOURCE_DIR="$release_source_dir" \
    FRUME_RELEASE_HANDOFF_PATH="$release_handoff_path" \
    "$release_source_dir/scripts/archive-ios-release.sh"
fi

if [ -z "${FRUME_RELEASE_SOURCE_DIR:-}" ] ||
   [ -z "${FRUME_RELEASE_HANDOFF_PATH:-}" ] ||
   [ ! -d "$FRUME_RELEASE_SOURCE_DIR" ] ||
   [ "$(CDPATH= cd -- "$FRUME_RELEASE_SOURCE_DIR" && pwd -P)" != "$repo_dir" ] ||
   [ "$FRUME_RELEASE_HANDOFF_PATH" != "$repo_dir/.frume-release-handoff.json" ] ||
   [ ! -f "$FRUME_RELEASE_HANDOFF_PATH" ] ||
   [ -e "$repo_dir/.git" ]; then
  echo "Reviewed release source stage is invalid." >&2
  exit 2
fi
handoff_values=$(node -e '
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const path = process.argv[1];
  const expectedSource = process.argv[2];
  const expectedSha = process.argv[3];
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  if (
    data.sourceDirectory !== expectedSource ||
    data.reviewedSha !== expectedSha ||
    !/^[0-9a-f]{64}$/.test(data.manifestDigest) ||
    !/^[0-9a-f]{64}$/.test(data.nonce)
  ) process.exit(2);
  const lines = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === ".frume-release-handoff.json") continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        const mode = stat.mode & 0o111 ? "100755" : "100644";
        const contents = fs.readFileSync(absolute);
        const header = Buffer.from(`blob ${contents.length}\0`);
        const oid = crypto.createHash("sha1").update(header).update(contents).digest("hex");
        lines.push(`${mode} ${oid}\t${relative}`);
      } else process.exit(2);
    }
  }
  walk(expectedSource);
  lines.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const digest = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
  if (digest !== data.manifestDigest) process.exit(2);
  process.stdout.write(`${data.reviewedSha}\n${data.nonce}\n${data.manifestDigest}\n`);
' "$FRUME_RELEASE_HANDOFF_PATH" "$repo_dir" "$FRUME_REVIEWED_RELEASE_SHA") || {
  echo "Reviewed release source handoff could not be authenticated." >&2
  exit 2
}
handoff_sha=$(printf '%s\n' "$handoff_values" | sed -n '1p')
handoff_nonce=$(printf '%s\n' "$handoff_values" | sed -n '2p')
handoff_manifest=$(printf '%s\n' "$handoff_values" | sed -n '3p')
if [ "$handoff_sha" != "$FRUME_REVIEWED_RELEASE_SHA" ] ||
   [ -z "$handoff_nonce" ] || [ -z "$handoff_manifest" ]; then
  echo "Reviewed release source handoff is invalid." >&2
  exit 2
fi

# A handoff digest proves only self-consistency. Independently fetch canonical
# main again with the reviewed Node validator (which strips every GIT_* input),
# materialize its exact tree, and compare that raw manifest to this stage.
canonical_manifest_json=$(
  FRUME_VERIFY_CANONICAL_MANIFEST=1 \
  FRUME_REVIEWED_RELEASE_SHA="$FRUME_REVIEWED_RELEASE_SHA" \
  node "$release_revision_validator"
) || {
  echo "Canonical release source could not be re-verified." >&2
  exit 2
}
canonical_manifest=$(printf '%s' "$canonical_manifest_json" | node -e '
  let body = "";
  process.stdin.on("data", (chunk) => { body += chunk; });
  process.stdin.on("end", () => {
    const data = JSON.parse(body);
    if (
      data.reviewedSha !== process.argv[1] ||
      !/^[0-9a-f]{64}$/.test(data.manifestDigest)
    ) process.exit(2);
    process.stdout.write(data.manifestDigest);
  });
' "$FRUME_REVIEWED_RELEASE_SHA") || {
  echo "Canonical release manifest is invalid." >&2
  exit 2
}
if [ "$canonical_manifest" != "$handoff_manifest" ]; then
  echo "Reviewed release tree does not match canonical main." >&2
  exit 2
fi
rm -f -- "$FRUME_RELEASE_HANDOFF_PATH"
unset FRUME_RELEASE_HANDOFF_PATH FRUME_RELEASE_SOURCE_DIR
release_source_dir="$repo_dir"
trap 'rm -rf -- "$release_source_dir"' EXIT HUP INT TERM

echo "Using pristine reviewed source: $repo_dir"

# Re-run every release validator from the reviewed source itself.
node "$photo_api_url_validator" || exit 2
node "$apple_toolchain_validator" || exit 2
node "$revenuecat_validator" || exit 2
if [ -n "${EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:-}" ]; then
  echo "Unset EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY for an iOS release archive."
  exit 2
fi

# A signed candidate must point at the exact deployed, enabled Worker version,
# not merely at a syntactically valid HTTPS origin.
node "$photo_api_health_validator" || exit 2

# An archive is the final release transaction, so legal-page reachability and
# exact reviewed content are never optional here.
FRUME_VERIFY_PUBLIC_RELEASE_PAGES=1 node "$public_pages_validator" || exit 2

case "$FRUME_BUILD_NUMBER" in
  ''|*[!0-9]*|0*)
    echo "FRUME_BUILD_NUMBER must be a positive integer."
    exit 2
    ;;
esac

echo "Running the complete release check from ${FRUME_REVIEWED_RELEASE_SHA}"
(
  cd "$repo_dir"
  echo "Installing the exact root and Worker dependency graphs from lockfiles"
  npm ci --ignore-scripts=false
  npm --prefix server ci --ignore-scripts=false
  npm run check
  npm run security:dependencies
)

# ios/ is deliberately generated and gitignored. Always recreate it inside the
# release transaction so a clean Git tree cannot hide a stale or hand-edited
# native project. EXPO_NO_DOTENV also prevents legacy local credentials from
# entering the production prebuild environment.
echo "Generating a clean iOS project from the reviewed app configuration"
(
  cd "$repo_dir"
  CI=1 EXPO_NO_DOTENV=1 npx expo prebuild --platform ios --clean
)

if [ ! -d "$workspace" ] || [ ! -f "$native_info_plist" ]; then
  echo "Clean iOS prebuild completed without the expected workspace or Info.plist."
  exit 2
fi

expected_bundle_id=$(
  cd "$repo_dir"
  node -e 'process.stdout.write(require("./app.config.js").expo.ios.bundleIdentifier)' </dev/null
)
expected_marketing_version=$(
  cd "$repo_dir"
  node -e 'process.stdout.write(require("./app.config.js").expo.version)' </dev/null
)
native_build_number=$(plutil -extract CFBundleVersion raw "$native_info_plist")
native_marketing_version=$(plutil -extract CFBundleShortVersionString raw "$native_info_plist")
native_bundle_id=$(
  xcodebuild \
    -workspace "$workspace" \
    -scheme Frume \
    -configuration Release \
    -showBuildSettings 2>/dev/null |
    awk -F ' = ' '/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = / { print $2; exit }'
)

if [ -z "$native_bundle_id" ]; then
  echo "Clean iOS prebuild did not expose PRODUCT_BUNDLE_IDENTIFIER."
  exit 2
fi

if [ "$native_build_number" != "$FRUME_BUILD_NUMBER" ]; then
  echo "Generated iOS build number is $native_build_number, not requested $FRUME_BUILD_NUMBER."
  echo "The clean prebuild did not reproduce the requested release configuration."
  exit 2
fi

if [ "$native_bundle_id" != "$expected_bundle_id" ] ||
   [ "$native_marketing_version" != "$expected_marketing_version" ]; then
  echo "The clean iOS prebuild identity does not match app.config.js."
  exit 2
fi

if [ -z "$archive_root" ]; then
  archive_root=$(mktemp -d "$frume_tmp_root/frume-ios-archive.XXXXXX")
fi

archive_path="$archive_root/Frume.xcarchive"
derived_data="$archive_root/DerivedData"

echo "Archiving Frume for generic iOS device"
echo "Archive: $archive_path"

xcodebuild \
  -quiet \
  -workspace "$workspace" \
  -scheme Frume \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$archive_path" \
  -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates \
  -jobs "${FRUME_XCODE_JOBS:-4}" \
  DEVELOPMENT_TEAM="$FRUME_DEVELOPMENT_TEAM" \
  CURRENT_PROJECT_VERSION="$FRUME_BUILD_NUMBER" \
  CODE_SIGN_STYLE=Automatic \
  CC="$compiler_proxy" \
  CPLUSPLUS="$compiler_proxy" \
  CLANG_ENABLE_EXPLICIT_MODULES=NO \
  archive

archived_info_plist="$archive_path/Products/Applications/Frume.app/Info.plist"
archived_js_bundle="$archive_path/Products/Applications/Frume.app/main.jsbundle"
if [ ! -f "$archived_info_plist" ]; then
  echo "Archive completed without the expected Frume.app Info.plist."
  exit 70
fi

# Metro substitutes EXPO_PUBLIC_* values while producing this file. Inspecting
# the archived bundle catches stale/generated credentials that source-only
# checks cannot see.
if ! node "$revenuecat_validator" --bundle "$archived_js_bundle"; then
  echo "Archived JavaScript bundle failed RevenueCat release validation."
  exit 70
fi

archived_build_number=$(plutil -extract CFBundleVersion raw "$archived_info_plist")
archived_bundle_id=$(plutil -extract CFBundleIdentifier raw "$archived_info_plist")
archived_marketing_version=$(plutil -extract CFBundleShortVersionString raw "$archived_info_plist")

if [ "$archived_build_number" != "$FRUME_BUILD_NUMBER" ] ||
   [ "$archived_bundle_id" != "$expected_bundle_id" ] ||
   [ "$archived_marketing_version" != "$expected_marketing_version" ]; then
  echo "Archived app identity does not match the reviewed release configuration."
  echo "Expected $expected_bundle_id $expected_marketing_version ($FRUME_BUILD_NUMBER)."
  echo "Observed $archived_bundle_id $archived_marketing_version ($archived_build_number)."
  exit 70
fi

echo "Archive identity verified: $archived_bundle_id $archived_marketing_version ($archived_build_number)"
