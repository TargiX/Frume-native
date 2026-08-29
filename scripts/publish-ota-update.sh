#!/bin/sh

set -eu

if [ -n "${NODE_OPTIONS:-}" ] || [ -n "${NODE_PATH:-}" ]; then
  echo "Unset NODE_OPTIONS and NODE_PATH for the OTA transaction." >&2
  exit 2
fi

# This must be set before Node loads any Expo or EAS-related module. The
# reviewed public configuration comes only from the operator's explicit
# environment and is preserved through the complete publication transaction.
export EXPO_NO_DOTENV=1

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec node "$script_dir/publish-ota-update.mjs"
