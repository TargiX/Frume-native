#!/bin/sh

set -eu

: "${FRUME_DEVELOPMENT_TEAM:?Set the reviewed Apple Developer team ID}"
: "${FRUME_BUILD_NUMBER:?Set the App Store Connect build number}"
: "${EXPO_PUBLIC_PHOTO_API_URL:?Set the verified production Worker URL}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:?Set the RevenueCat iOS public SDK key}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:?Set the reviewed iOS non-consumable product ID}"
: "${EXPO_PUBLIC_PRIVACY_URL:?Set the published privacy-policy URL}"
: "${EXPO_PUBLIC_SUPPORT_URL:?Set the published support URL}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
workspace="$repo_dir/ios/Frume.xcworkspace"
native_info_plist="$repo_dir/ios/Frume/Info.plist"
compiler_proxy="$script_dir/xcode-clang-proxy.py"
photo_api_url_validator="$script_dir/validate-production-photo-api-url.mjs"
frume_tmp_root=${TMPDIR:-/tmp}
archive_root=${FRUME_ARCHIVE_ROOT:-}

# Validate public release configuration independently of Git state so the
# guard remains directly testable from a dirty development worktree. A valid
# URL never bypasses the committed, clean-tree checks below.
if ! node "$photo_api_url_validator"; then
  exit 2
fi

if ! git -C "$repo_dir" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Release archives must come from a committed Git revision."
  exit 2
fi

if [ -n "$(git -C "$repo_dir" status --porcelain --untracked-files=all)" ]; then
  echo "Release archives require a clean working tree, including no untracked files."
  echo "Review and commit the exact candidate before archiving."
  exit 2
fi

case "$FRUME_BUILD_NUMBER" in
  ''|*[!0-9]*|0*)
    echo "FRUME_BUILD_NUMBER must be a positive integer."
    exit 2
    ;;
esac

node <<'NODE'
const requiredPublicUrls = [
  ['EXPO_PUBLIC_PRIVACY_URL', process.env.EXPO_PUBLIC_PRIVACY_URL],
  ['EXPO_PUBLIC_SUPPORT_URL', process.env.EXPO_PUBLIC_SUPPORT_URL],
];

for (const [name, value] of requiredPublicUrls) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error(`${name} must be an absolute public HTTPS URL.`);
    process.exit(2);
  }
  const localHost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';
  if (
    parsed.protocol !== 'https:' ||
    localHost ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    console.error(`${name} must be a public HTTPS URL without credentials or a fragment.`);
    process.exit(2);
  }
}
NODE

echo "Running the complete release check from $(git -C "$repo_dir" rev-parse --short=12 HEAD)"
(cd "$repo_dir" && npm run check)

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
if [ ! -f "$archived_info_plist" ]; then
  echo "Archive completed without the expected Frume.app Info.plist."
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
