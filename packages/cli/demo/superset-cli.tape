# ─────────────────────────────────────────────────────────────
#  Superset CLI — punchy end-to-end walkthrough
#
#  Render with:  vhs demo/superset-cli.tape       (run from packages/cli)
#  Then add the soundtrack:  ./demo/add-sound.sh  (pad + keyboard clicks → superset-cli-sound.mp4)
#  Requires a built binary at ./dist/superset, a logged-in session, the
#  host service running on this machine, and at least one project.
#
#  Note: `workspaces create/open/delete` are shimmed in the hidden setup
#  block — a real create takes ~15s and spawns a real agent + worktree,
#  which is too slow/destructive for a recording. Everything else is real.
# ─────────────────────────────────────────────────────────────

Output demo/superset-cli.gif
Output demo/superset-cli.mp4

Set Shell "bash"
Set FontSize 27
Set Width 1640
Set Height 880
Set Padding 22
Set Margin 28
Set MarginFill "#0a0a0b"
Set BorderRadius 12
# Superset brand palette — burnt-orange accent on near-black (matches superset.sh)
Set Theme { "name": "Superset", "background": "#101012", "foreground": "#ECECEE", "cursor": "#E8804A", "selection": "#D2561140", "black": "#1C1C1F", "red": "#D25611", "green": "#6BB37E", "yellow": "#D2A24A", "blue": "#5B9BD5", "magenta": "#C97FD6", "cyan": "#56B6C2", "white": "#C8C8CC", "brightBlack": "#6B6B72", "brightRed": "#E8804A", "brightGreen": "#86D49B", "brightYellow": "#E8C07A", "brightBlue": "#7FB3E8", "brightMagenta": "#D896E4", "brightCyan": "#86D0DB", "brightWhite": "#FFFFFF" }
Set TypingSpeed 28ms
Set PlaybackSpeed 1.0

# --- setup (hidden from the final video) ---
Hide
Type "unset CLAUDE_CODE CLAUDECODE CLAUDE_CODE_ENTRYPOINT CODEX_CLI GEMINI_CLI SUPERSET_AGENT CI 2>/dev/null"
Enter
Type `export PATH="$PWD/dist:$PATH"`
Enter
Type `export PROJECT=$(superset projects list --quiet | head -1)`
Enter
Type `_superset_bin="$PWD/dist/superset"`
Enter
Type `superset() { if [ "$1" = workspaces ] && [ "$2" = create ]; then printf 'Created workspace "fix-dark-mode" on host Kiets-Spaceship\n  branch    fix/dark-mode\n  agent     Claude  (streaming to the desktop app)\n  workspace ws_3f9c1a2b\n'; elif [ "$1" = workspaces ] && [ "$2" = open ]; then echo 'Opening "fix-dark-mode" in Superset desktop'; elif [ "$1" = workspaces ] && [ "$2" = delete ]; then echo 'Deleted workspace "fix-dark-mode"'; else command "$_superset_bin" "$@"; fi; }`
Enter
Type `export PS1="\[\033[1;91m\]superset\[\033[0m\] \[\033[90m\]demo\[\033[0m\] \[\033[91m\]❯\[\033[0m\] "`
Enter
Type "clear"
Enter
Show

# --- the walkthrough ---
Sleep 500ms
Type "# 👋 The Superset CLI — drive your dev loop from the terminal. So can your agents."
Sleep 1.4s
Enter
Sleep 600ms
Type "# This machine's a host — workspaces run right here:"
Sleep 400ms
Enter
Sleep 250ms
Type "superset status"
Enter
Sleep 2.4s

Type "clear"
Enter
Sleep 300ms
Type "# A bug just landed — file it, grab the id:"
Sleep 600ms
Enter
Sleep 250ms
Type `TASK=$(superset tasks create --title "Dark mode flickers on the dashboard" --priority high --quiet)`
Enter
Sleep 1.6s
Type "superset tasks list | head -7"
Enter
Sleep 2.8s

Type `# "high" doesn't cover it:`
Sleep 400ms
Enter
Sleep 250ms
Type `superset tasks update "$TASK" --priority urgent`
Enter
Sleep 2.4s

Type "clear"
Enter
Sleep 300ms
Type "# Which agent can fix it?"
Sleep 400ms
Enter
Sleep 250ms
Type "superset agents list --local"
Enter
Sleep 2.6s
Type "# Spin up a workspace running one — repo cloned, agent started, one command:"
Sleep 700ms
Enter
Sleep 300ms
Type `superset workspaces create --local --project "$PROJECT" \`
Enter
Type `  --name fix-dark-mode --branch fix/dark-mode \`
Enter
Type `  --agent claude --prompt "Fix the dark-mode flicker on the dashboard"`
Enter
Sleep 3s

Type "clear"
Enter
Sleep 300ms
Type "# Same workspace the desktop app shows — jump straight into it:"
Sleep 600ms
Enter
Sleep 300ms
Type "superset workspaces open ws_3f9c1a2b"
Enter
Sleep 2.4s

Type "# Demo's done — tear down the throwaway bits:"
Sleep 500ms
Enter
Sleep 300ms
Type `superset workspaces delete ws_3f9c1a2b && superset tasks delete "$TASK"`
Enter
Sleep 2.6s

Type "clear"
Enter
Sleep 300ms
Type "# Any coding agent can run all of this. In Claude Code:"
Sleep 700ms
Enter
Sleep 300ms
Type "#   /plugin marketplace add superset-sh/superset && /plugin install superset@superset"
Sleep 900ms
Enter
Sleep 400ms
Type "# Now your agent files its own tasks, spins up workspaces, runs other agents."
Sleep 1.4s
Enter
Sleep 600ms
Type "# File it, fix it, ship it — from your terminal, or your agent.   superset.sh"
Sleep 1s
Enter
Sleep 2.8s
