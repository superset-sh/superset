# ─────────────────────────────────────────────────────────────
#  Superset CLI — friendly end-to-end walkthrough (~55s)
#
#  Render with:  vhs demo/superset-cli.tape   (run from packages/cli)
#  Requires a built binary at ./dist/superset and a logged-in session
#  with the host service running.
# ─────────────────────────────────────────────────────────────

Output demo/superset-cli.gif
Output demo/superset-cli.mp4

Set Shell "bash"
Set FontSize 23
Set Width 1560
Set Height 820
Set Padding 28
Set Margin 32
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
Type `export PS1="\[\033[1;91m\]superset\[\033[0m\] \[\033[90m\]demo\[\033[0m\] \[\033[91m\]❯\[\033[0m\] "`
Enter
Type "clear"
Enter
Show

# --- the walkthrough ---
Sleep 500ms
Type "# 👋 Meet the Superset CLI — your whole dev loop, straight from the terminal."
Sleep 1.2s
Enter
Sleep 700ms
Type "superset auth whoami"
Sleep 300ms
Enter
Sleep 2.6s

Type "# Workspaces run on hosts. Mine's right here, healthy and ready:"
Sleep 500ms
Enter
Sleep 300ms
Type "superset status"
Enter
Sleep 2.6s

Type "clear"
Enter
Sleep 300ms
Type "# The full toolbox:"
Enter
Sleep 350ms
Type "superset --help"
Enter
Sleep 3s

Type "clear"
Enter
Sleep 300ms
Type "# A bug just landed — file it, and stash its id in one go:"
Sleep 600ms
Enter
Sleep 300ms
Type `TASK=$(superset tasks create --title "Dark mode flickers on the dashboard" --priority high --quiet)`
Enter
Sleep 2.4s

Type "# ...and there it is, right at the top of the backlog:"
Sleep 500ms
Enter
Sleep 300ms
Type "superset tasks list | head -7"
Enter
Sleep 3s

Type "clear"
Enter
Sleep 300ms
Type "# Bump it to urgent, then pull up the details:"
Sleep 600ms
Enter
Sleep 300ms
Type `superset tasks update "$TASK" --priority urgent`
Enter
Sleep 2.8s
Type `superset tasks get "$TASK"`
Enter
Sleep 3s

Type "clear"
Enter
Sleep 300ms
Type "# Ready to fix it? Spin up a workspace AND a coding agent in one command:"
Sleep 800ms
Enter
Sleep 400ms
Type `#   superset workspaces create --branch fix/dark-mode --agent claude \`
Enter
Type `#     --prompt "Fix the dark-mode flicker on the dashboard"`
Enter
Sleep 600ms
Type "# It clones the repo on a host, starts the agent, and streams it to the desktop app."
Sleep 1.4s
Enter
Sleep 800ms

Type "# Demo's done — clean up the throwaway task:"
Sleep 500ms
Enter
Sleep 300ms
Type `superset tasks delete "$TASK"`
Enter
Sleep 2.4s

Type "# The loop: file it, fix it, ship it — all from your terminal.  |  superset.sh"
Sleep 1s
Enter
Sleep 2.8s
