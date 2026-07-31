#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
workspace="$repo_dir/ios/Frume.xcworkspace"
compiler_proxy="$script_dir/xcode-clang-proxy.py"
frume_tmp_root=${TMPDIR:-/tmp}
derived_data=${FRUME_DERIVED_DATA_PATH:-}

if [ ! -d "$workspace" ]; then
  echo "Missing $workspace"
  echo "Run: EXPO_NO_DOTENV=1 npx expo prebuild --platform ios --clean"
  exit 2
fi

if [ -z "$derived_data" ]; then
  derived_data=$(mktemp -d "$frume_tmp_root/frume-ios-release.XXXXXX")
fi

echo "Building Frume Release for the Apple Silicon iOS Simulator"
echo "DerivedData: $derived_data"

exec xcodebuild \
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
