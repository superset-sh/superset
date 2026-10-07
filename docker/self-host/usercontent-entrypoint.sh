#!/bin/sh
set -eu
worker_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$worker_dir/render-usercontent-config.mjs" "$worker_dir/usercontent.capnp" "$worker_dir/usercontent.runtime.capnp"
exec workerd serve "$worker_dir/usercontent.runtime.capnp"
