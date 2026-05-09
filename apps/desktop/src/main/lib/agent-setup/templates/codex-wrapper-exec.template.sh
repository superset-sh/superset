# Lifecycle is driven by codex's native hooks in ~/.codex/hooks.json
# (registered by createCodexHooksJson). The legacy `notify=...` callback
# stays as a backstop for completion notifications on builds where the
# native Stop hook hasn't reached parity.
"$REAL_BIN" --enable hooks -c 'notify=["bash","{{NOTIFY_PATH}}"]' "$@"
