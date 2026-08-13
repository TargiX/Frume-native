#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
validator="$script_dir/validate-production-photo-api-url.mjs"
archive_script="$script_dir/archive-ios-release.sh"
accepted=0
rejected=0

expect_accept() {
  description=$1
  candidate=$2

  if EXPO_PUBLIC_PHOTO_API_URL="$candidate" node "$validator" >/dev/null 2>&1; then
    accepted=$((accepted + 1))
    return
  fi

  echo "FAIL: expected acceptance for $description" >&2
  exit 1
}

expect_reject() {
  description=$1
  candidate=$2

  if EXPO_PUBLIC_PHOTO_API_URL="$candidate" node "$validator" >/dev/null 2>&1; then
    echo "FAIL: expected rejection for $description" >&2
    exit 1
  fi

  rejected=$((rejected + 1))
}

expect_accept "public HTTPS hostname" "https://photos.example.com"
expect_accept "public HTTPS hostname with trailing slash" "https://photos.example.com/"
expect_accept "public IPv4 literal" "https://8.8.8.8"
expect_accept "public IPv6 literal" "https://[2606:4700:4700::1111]"

expect_reject "empty value" ""
expect_reject "malformed URL" "not a URL"
expect_reject "public HTTP URL" "http://photos.example.com"
expect_reject "embedded username" "https://user@photos.example.com"
expect_reject "embedded password" "https://user:secret@photos.example.com"
expect_reject "query string" "https://photos.example.com?environment=dev"
expect_reject "fragment" "https://photos.example.com#dev"
expect_reject "path prefix" "https://photos.example.com/api/"
expect_reject "endpoint path" "https://photos.example.com/photo"
expect_reject "localhost" "https://localhost"
expect_reject "localhost trailing dot" "https://localhost."
expect_reject "localhost subdomain" "https://photos.localhost"
expect_reject "IPv4 loopback" "https://127.0.0.1"
expect_reject "short IPv4 loopback notation" "https://127.1"
expect_reject "integer IPv4 loopback notation" "https://2130706433"
expect_reject "IPv4 private 10/8" "https://10.12.0.3"
expect_reject "IPv4 private 172.16/12" "https://172.20.0.3"
expect_reject "IPv4 private 192.168/16" "https://192.168.1.3"
expect_reject "IPv4 link-local" "https://169.254.1.3"
expect_reject "IPv6 loopback" "https://[::1]"
expect_reject "IPv6 unique-local" "https://[fd12:3456::1]"
expect_reject "IPv6 link-local" "https://[fe80::1]"
expect_reject "IPv4-mapped IPv6 loopback" "https://[::ffff:127.0.0.1]"

if archive_output=$(
  env \
    -u FRUME_RELEASE_SOURCE_STAGE \
    -u FRUME_RELEASE_SOURCE_DIR \
    -u FRUME_RELEASE_HANDOFF_PATH \
    FRUME_DEVELOPMENT_TEAM="TESTTEAM" \
    FRUME_BUILD_NUMBER="1" \
    EXPO_PUBLIC_PHOTO_API_URL="http://127.0.0.1:8787" \
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY="test_public_key" \
    EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID="test_product" \
    EXPO_PUBLIC_PRIVACY_URL="https://www.example.com/privacy" \
    EXPO_PUBLIC_SUPPORT_URL="https://www.example.com/support" \
    "$archive_script" 2>&1
); then
  echo "FAIL: archive script accepted a loopback photo API URL" >&2
  exit 1
fi

case "$archive_output" in
  *"must use HTTPS for an App Store archive."*)
    rejected=$((rejected + 1))
    ;;
  *)
    echo "FAIL: archive script did not report the production URL problem" >&2
    exit 1
    ;;
esac

echo "Production photo API URL validation passed ($accepted accepted, $rejected rejected)."
