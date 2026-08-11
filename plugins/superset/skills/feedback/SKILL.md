---
name: feedback
description: Collect and submit feedback about Superset — bug reports, feature requests, or general feedback — privately to the Superset team or as a public GitHub issue. Use when the user wants to report a Superset bug, request a feature, or send feedback about Superset.
argument-hint: describe the bug, request, or feedback
---

# Superset Feedback

Help the user turn their feedback about Superset into a well-formed report and submit it where they choose. Treat whatever they wrote after the command as the seed.

## 1. Gather context (best effort, never block)

Run in parallel; skip anything that fails:

- `superset --version` and `uname -sm` for the environment block
- `superset auth whoami` for the signed-in user/org (private submissions only)

Do NOT include repository contents, terminal output, or logs unless the user explicitly agrees when asked.

For **bugs**, also offer (never assume):

- **Screenshot** — if the bug is visual and you can capture one, offer to attach it. Evidence beats prose.
- **Diagnostics** — offer to attach a diagnostics bundle (CLI version, OS, last 200 app log lines) via the `--diagnostics` flag. Tell the user logs can contain file paths and project names before they agree.

## 2. Classify and draft

Classify as **bug**, **feature request**, or **general feedback** from their words; ask only if genuinely ambiguous. Then draft:

- **Title** — one line, imperative, specific
- **What happened / What you want** — 2-5 sentences in the user's voice
- **Steps to reproduce** — bugs only, numbered
- **Environment** — Superset version, OS (bugs only)

## 3. Ask where to send it

Show the full draft, then ask the user (use the ask_user tool if available, otherwise a plain question) with exactly these options:

1. **Send privately to the Superset team**
2. **Open a public GitHub issue**
3. **Edit the draft first**
4. **Cancel**

Never submit anything before the user explicitly picks 1 or 2. Loop on edits.

## 4. Submit

**Private path:**
- If `superset feedback --help` exits 0, submit via stdin (note: `--body-file=-` with the equals sign; a space-separated `-` is rejected by the parser):
  ```bash
  superset feedback submit --type bug --title "..." --body-file=- <<'EOF'
  <drafted report>
  EOF
  ```
  Only when the user agreed to them in step 1, add `--attach /path/to/screenshot.png` (comma-separated paths, 10MB total) and/or `--diagnostics`. The submission is sent from the user's Superset account, a copy is CC'd to them, and the team replies to their account email.
- If the CLI is missing or not logged in (`superset auth whoami` fails), offer `superset auth login` first; if declined, fall back to email: give the user a clickable mailto link (`mailto:support@superset.sh?subject=<url-encoded title>&body=<url-encoded body>`) and also print the raw draft so they can copy it.

**Public path:**
- **Check for duplicates first**: `gh search issues -R superset-sh/superset "<key terms>" --limit 5`. If an existing issue matches, show it and offer to comment there (`gh issue comment`) instead of opening a new one — only create a fresh issue if the user confirms it's genuinely different.
- If `gh` is installed and `gh auth status` succeeds: `gh issue create -R superset-sh/superset --title "..." --body "..."` (write the body via a heredoc or temp file, never inline-escape).
- Otherwise open the prefilled form in the browser: `https://github.com/superset-sh/superset/issues/new?title=<url-encoded>&body=<url-encoded>`.

## 5. Confirm

Report back the issue URL (public) or a confirmation of what was sent and to whom (private). If anything failed, show the draft so the user's writing is never lost.
