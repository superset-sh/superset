# Credential guard: ambient Anthropic credential env vars override Claude
# Code's stored login (Claude Code precedence: ANTHROPIC_API_KEY env >
# ANTHROPIC_AUTH_TOKEN env > stored/keychain auth). A stale, exhausted, or
# zero-credit key exported by a shell rc file makes every launch run on — or
# die with — the wrong account (e.g. "Credit balance is too low") instead of
# the subscribed login. Strip them for claude only; the stored login then
# wins. Values are never logged.
#
# CLAUDE_SHIM_SELFTEST=1 prints which ambient vars would be stripped and
# exits without launching. CLAUDE_SHIM_KEEP_ENV=1 skips the strip entirely
# (explicit opt-out for callers that intentionally inject credentials).
if [ "${CLAUDE_SHIM_SELFTEST:-}" = "1" ]; then
	stripped=""
	for _v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN; do
		if [ -n "$(printenv "$_v" 2>/dev/null)" ]; then
			stripped="${stripped:+$stripped }$_v"
		fi
	done
	echo "real binary: $REAL_BIN"
	echo "ambient creds stripped:${stripped:+ $stripped}"
	if [ "${CLAUDE_SHIM_KEEP_ENV:-}" = "1" ]; then
		echo "mode: keep-env (guard skipped by caller)"
	else
		echo "mode: guard (stored login wins)"
	fi
	exit 0
fi
if [ "${CLAUDE_SHIM_KEEP_ENV:-}" = "1" ]; then
	exec "$REAL_BIN" --settings "{{SETTINGS_PATH}}" "$@"
fi
exec env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN "$REAL_BIN" --settings "{{SETTINGS_PATH}}" "$@"
