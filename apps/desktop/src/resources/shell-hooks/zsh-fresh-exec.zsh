# fresh-exec shell hook for Superset terminals
# ----------------------------------------------
# Shadows a whitelist of Go-based CLIs with zsh functions that re-invoke
# them through the `fresh-exec` helper. Purpose: bypass stale Mach
# bootstrap context in terminal-host's daemon by proxying each command
# through the fresh-spawn server running in Superset's Electron main
# process.
#
# Environment variables:
#   SUPERSET_FRESH_EXEC_COMMANDS  Space-separated whitelist. Superset
#                                 sets this when sourcing the hook; if
#                                 unset, the hook is a no-op.
#   SUPERSET_FRESH_EXEC_BIN       Path to the fresh-exec binary. Superset
#                                 sets this to the packaged location;
#                                 if unset or non-executable, the hook
#                                 leaves commands untouched.
#   SUPERSET_FRESH_EXEC_ACTIVE    Set by fresh-exec itself to mark the
#                                 subprocess environment; the hook skips
#                                 when this is set to avoid recursion.
#
# Usage in plain zsh (not via Superset): don't source it; nothing
# interesting happens without the env vars above set.
#
# Bypass: `command <name>` or `\<name>` bypasses the function override
# and runs the real binary directly (stale context; TLS commands will
# fail). Useful for debugging.

# Skip when essential env vars are absent
if [[ -z "$SUPERSET_FRESH_EXEC_COMMANDS" ]] \
	|| [[ -z "$SUPERSET_FRESH_EXEC_BIN" ]] \
	|| [[ ! -x "$SUPERSET_FRESH_EXEC_BIN" ]] \
	|| [[ -n "$SUPERSET_FRESH_EXEC_ACTIVE" ]]; then
	return 0
fi

for _superset_cmd in ${(z)SUPERSET_FRESH_EXEC_COMMANDS}; do
	# Validate before `eval` — SUPERSET_FRESH_EXEC_COMMANDS is set by the
	# Superset process, but the env is inherited by user shell init (.zshrc,
	# direnv, asdf, etc.) that can rewrite arbitrary env vars. An entry like
	# "a;rm -rf ~" would otherwise produce shell injection through eval.
	[[ $_superset_cmd =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || continue
	# Define a shell function with the same name, shadowing the binary.
	eval "
		function ${_superset_cmd}() {
			if [[ -x \"\$SUPERSET_FRESH_EXEC_BIN\" ]]; then
				SUPERSET_FRESH_EXEC_ACTIVE=1 \"\$SUPERSET_FRESH_EXEC_BIN\" ${_superset_cmd} \"\$@\"
			else
				command ${_superset_cmd} \"\$@\"
			fi
		}
	"
done

unset _superset_cmd
