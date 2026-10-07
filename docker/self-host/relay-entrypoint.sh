#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$SCRIPT_DIR/render-relay-config.mjs" "$SCRIPT_DIR/relay.capnp.in" "$SCRIPT_DIR/relay.capnp"
exec workerd serve "$SCRIPT_DIR/relay.capnp" \
  --directory-path "do-disk=${RELAY2_DO_DIR:-/data/durable-objects}" \
  --directory-path "placement-disk=${RELAY2_PLACEMENT_DIR:-/data/placement}"
