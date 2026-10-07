#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$SCRIPT_DIR/render-realtime-config.mjs" "$SCRIPT_DIR/realtime.capnp.in" "$SCRIPT_DIR/realtime.capnp"
exec workerd serve "$SCRIPT_DIR/realtime.capnp" \
  --directory-path "do-disk=/data/realtime-durable-objects"
