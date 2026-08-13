#!/bin/sh

set -eu

if [ -n "${NODE_OPTIONS:-}" ] || [ -n "${NODE_PATH:-}" ]; then
  echo "Unset NODE_OPTIONS and NODE_PATH for the iOS Release proof." >&2
  exit 2
fi

# Release-like simulator proofs must use only the environment passed to this
# process. A gitignored developer .env must never enter prebuild or Metro.
export EXPO_NO_DOTENV=1

: "${FRUME_BUILD_NUMBER:?Set the release-like iOS build number}"
: "${EXPO_PUBLIC_PHOTO_API_URL:?Set the public HTTPS photo API URL under test}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:?Set the iOS public SDK key under test}"
: "${EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:?Set the iOS non-consumable product ID under test}"
: "${EXPO_PUBLIC_PRIVACY_URL:?Set the public privacy-policy URL under test}"
: "${EXPO_PUBLIC_SUPPORT_URL:?Set the public support URL under test}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
workspace="$repo_dir/ios/Frume.xcworkspace"
native_info_plist="$repo_dir/ios/Frume/Info.plist"
compiler_proxy="$script_dir/xcode-clang-proxy.py"
photo_api_url_validator="$script_dir/validate-production-photo-api-url.mjs"
revenuecat_validator="$script_dir/validate-revenuecat-ios-release.mjs"
public_pages_validator="$script_dir/validate-public-release-pages.mjs"
apple_toolchain_validator="$script_dir/validate-apple-toolchain.mjs"
frume_tmp_root=${TMPDIR:-/tmp}
derived_data=${FRUME_DERIVED_DATA_PATH:-}

if [ -n "${EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:-}" ]; then
  echo "Unset EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY for an iOS Release proof."
  exit 2
fi

if ! node "$apple_toolchain_validator"; then
  exit 2
fi

if ! node "$photo_api_url_validator"; then
  exit 2
fi
if ! node "$revenuecat_validator"; then
  exit 2
fi
# Format-only here: the signed archive path performs the mandatory live check.
if ! FRUME_VERIFY_PUBLIC_RELEASE_PAGES=0 node "$public_pages_validator"; then
  exit 2
fi

case "$FRUME_BUILD_NUMBER" in
  ''|*[!0-9]*|0*)
    echo "FRUME_BUILD_NUMBER must be a positive integer."
    exit 2
    ;;
esac

echo "Generating a clean iOS project for the Release simulator proof"
(
  cd "$repo_dir"
  CI=1 npx expo prebuild --platform ios --clean
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

if [ -z "$derived_data" ]; then
  derived_data=$(mktemp -d "$frume_tmp_root/frume-ios-release.XXXXXX")
fi

echo "Building Frume Release for the Apple Silicon iOS Simulator"
echo "DerivedData: $derived_data"

xcodebuild \
  -quiet \
  -workspace "$workspace" \
  -scheme Frume \
  -configuration Release \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$derived_data" \
  -jobs "${FRUME_XCODE_JOBS:-4}" \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=NO \
  CC="$compiler_proxy" \
  CPLUSPLUS="$compiler_proxy" \
  CLANG_ENABLE_EXPLICIT_MODULES=NO \
  build

built_app="$derived_data/Build/Products/Release-iphonesimulator/Frume.app"
built_info_plist="$built_app/Info.plist"
built_js_bundle="$built_app/main.jsbundle"
if [ ! -f "$built_info_plist" ] || [ ! -f "$built_js_bundle" ]; then
  echo "Release build completed without the expected Frume.app artifact."
  exit 70
fi

if ! node "$revenuecat_validator" --bundle "$built_js_bundle"; then
  echo "Release JavaScript bundle failed RevenueCat configuration validation."
  exit 70
fi

built_build_number=$(plutil -extract CFBundleVersion raw "$built_info_plist")
built_bundle_id=$(plutil -extract CFBundleIdentifier raw "$built_info_plist")
built_marketing_version=$(plutil -extract CFBundleShortVersionString raw "$built_info_plist")

if [ "$built_build_number" != "$FRUME_BUILD_NUMBER" ] ||
   [ "$built_bundle_id" != "$expected_bundle_id" ] ||
   [ "$built_marketing_version" != "$expected_marketing_version" ]; then
  echo "Release simulator app identity does not match the reviewed configuration."
  echo "Expected $expected_bundle_id $expected_marketing_version ($FRUME_BUILD_NUMBER)."
  echo "Observed $built_bundle_id $built_marketing_version ($built_build_number)."
  exit 70
fi

echo "Release identity verified: $built_bundle_id $built_marketing_version ($built_build_number)"
echo "FRUME_APP_PATH=$built_app"
