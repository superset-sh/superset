#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CONFIG_PATH=${CLOUDFLARED_CONFIG:-"$ROOT_DIR/.cloudflared/config.yml"}
EXAMPLE_PATH="$ROOT_DIR/.cloudflared/config.example.yml"

if ! command -v cloudflared >/dev/null 2>&1; then
	echo "cloudflared is required for dev:tunnel."
	echo "Install it first, for example: brew install cloudflared"
	exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
	echo "Missing Cloudflare Tunnel config: $CONFIG_PATH"
	if [[ -f "$EXAMPLE_PATH" ]]; then
		echo "Copy $EXAMPLE_PATH to $CONFIG_PATH and replace the placeholders."
	fi
	exit 1
fi

if [[ -z "${EXTERNAL_API_URL:-}" ]]; then
	echo "EXTERNAL_API_URL is required for dev:tunnel."
	echo "Set it in .env to the stable public hostname for this machine."
	exit 1
fi

TUNNEL_NAME=${1:-${CLOUDFLARED_TUNNEL_NAME:-$(awk '/^[[:space:]]*tunnel:/ { print $2; exit }' "$CONFIG_PATH")}}

if [[ -z "$TUNNEL_NAME" ]]; then
	echo "Unable to determine the Cloudflare Tunnel name."
	echo "Set CLOUDFLARED_TUNNEL_NAME or add a 'tunnel:' entry to $CONFIG_PATH."
	exit 1
fi

CONFIG_HOST=$(awk '/hostname:/ { print $NF; exit }' "$CONFIG_PATH")
EXTERNAL_HOST=$(printf '%s\n' "$EXTERNAL_API_URL" | sed -E 's#^[a-z]+://([^/]+).*$#\1#')

if [[ -n "$CONFIG_HOST" && "$CONFIG_HOST" != "$EXTERNAL_HOST" ]]; then
	echo "Warning: EXTERNAL_API_URL host ($EXTERNAL_HOST) does not match config host ($CONFIG_HOST)." >&2
fi

echo "Running Cloudflare Tunnel '$TUNNEL_NAME' with config $CONFIG_PATH"
echo "Public API host: $EXTERNAL_API_URL"

cloudflared tunnel --config "$CONFIG_PATH" run "$TUNNEL_NAME"
