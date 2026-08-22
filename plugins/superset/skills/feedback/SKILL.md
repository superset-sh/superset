---
name: feedback
description: Collect and submit feedback about Superset (bug reports, feature requests, or general feedback) privately to the Superset team or as a public GitHub issue. Use when the user wants to report a Superset bug, request a feature, or send feedback about Superset.
argument-hint: describe the bug, request, or feedback
allowed-tools: Bash(superset:*) Bash(gh:*) Bash(uname:*)
---

# Superset Feedback

Turn the user's feedback about Superset into a short, scannable report and submit it where they choose. Treat whatever they wrote after the command as the seed.

The reader is a Superset engineer triaging dozens of reports. They should get the point from the title, the full picture from the summary bullets, and only read further when they need detail. Cut everything that doesn't help them reproduce or decide.

## 1. Gather context (best effort, never block)

Run in parallel; skip anything that fails:

- `superset --version` and `uname -sm` for the environment line
- `superset auth whoami` for the signed-in user/org (private submissions only)

Don't include repository contents, terminal output, or logs unless the user explicitly agrees when asked; they can contain private paths and code.

For **bugs**, also offer (never assume):

- **Screenshot**: if the bug is visual and you can capture one, offer to attach it. Evidence beats prose.
- **Diagnostics**: offer to attach a diagnostics bundle (CLI version, OS, last 200 app log lines) via the `--diagnostics` flag. Tell the user logs can contain file paths and project names before they agree.

## 2. Classify and draft

Classify as **bug**, **feature request**, or **general feedback** from their words; ask only if genuinely ambiguous.

### Title

`<Surface>: <symptom or ask>`, under 72 characters, no trailing period.

- Surface is the part of Superset involved: Terminal, Sidebar, Browser pane, Workspaces, Automations, CLI, Updater, Mobile, and so on.
- Bugs name the symptom, not the guess at the cause. Requests name the outcome, not the implementation.
- Don't prefix with "Bug:" or "Feature:"; the type is already carried separately.

Good: `Terminal: pane goes blank after waking from sleep`, `Sidebar: let me pin an automation to the top`.
Bad: `Bug with terminal`, `Terminal rendering broken because xterm loses WebGL context on resume`.

### Body

Plain text that also reads well as markdown: section labels on their own line, `-` bullets, numbered steps. No headings, bold, or tables; the private path is delivered as a plain-text email. Keep the user's own words where they're precise, tighten where they ramble.

Every report starts with a **Summary** of 2-4 bullets that stand alone. Someone reading only those bullets should know what's wrong (or wanted), how bad it is, and how often it happens.

Bug:

```text
Summary
- Terminal pane goes blank after the Mac wakes from sleep
- Happens every time; reloading the window fixes it
- Started in 1.21.0, didn't happen in 1.20.x

Steps to reproduce
1. Open a workspace with one terminal running
2. Close the lid for a minute, then open it
3. Click into the terminal

Expected
The terminal repaints and keeps its scrollback.

Actual
The pane is solid black until the window is reloaded.

Environment
Superset 1.21.0, macOS 26.0 arm64
```

Feature request:

```text
Summary
- I want to pin an automation so it stays at the top of the sidebar
- I check the same two automations many times a day and scroll past twenty others to find them

Today
Automations are sorted by last run, so the ones I care about move around.

Proposal
A pin action in the automation's context menu, pinned items listed first.
```

General feedback: Summary bullets, then one short paragraph of detail if there's more to say.

Omit any section with nothing to say. Steps, Expected, Actual, and Environment are for bugs only. Target under 150 words; go longer only when the extra words help reproduce.

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
  superset feedback submit --type <bug|feature|general> --title "..." --body-file=- <<'EOF'
  <drafted report>
  EOF
  ```
  Only when the user agreed to them in step 1, add `--attach /path/to/screenshot.png` (comma-separated paths, 10MB total) and/or `--diagnostics`. The submission is sent from the user's Superset account, a copy is CC'd to them, and the team replies to their account email.
- If the CLI is missing or not logged in (`superset auth whoami` fails), offer `superset auth login` first; if declined, fall back to email: give the user a clickable mailto link (`mailto:support@superset.sh?subject=<url-encoded title>&body=<url-encoded body>`) and also print the raw draft so they can copy it.

**Public path:**
- **Check for duplicates first**: `gh search issues -R superset-sh/superset "<key terms>" --limit 5`. If an existing issue matches, show it and offer to comment there (`gh issue comment`) instead of opening a new one; only create a fresh issue if the user confirms it's genuinely different.
- If `gh` is installed and `gh auth status` succeeds: `gh issue create -R superset-sh/superset --title "..." --body "..."` (write the body via a heredoc or temp file, never inline-escape).
- Otherwise open the prefilled form in the browser: `https://github.com/superset-sh/superset/issues/new?title=<url-encoded>&body=<url-encoded>`.

## 5. Confirm

Report back the issue URL (public) or a confirmation of what was sent and to whom (private). If anything failed, show the draft so the user's writing is never lost.
