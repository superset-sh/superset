---
name: feedback
description: Collect and submit feedback about Superset (bug reports, feature requests, or general feedback) privately to the Superset team or as a public GitHub issue. Use when the user wants to report a Superset bug, request a feature, or send feedback about Superset.
argument-hint: describe the bug, request, or feedback
allowed-tools: Bash(superset:*) Bash(gh:*) Bash(uname:*)
---

# Superset Feedback

Turn the user's feedback about Superset into a short, scannable report and submit it where they choose. Treat whatever they wrote after the command as the seed.

The reader is a Superset engineer triaging dozens of reports. They should get the point from the title, the full picture from the summary bullets, and only read further when they need detail. Cut everything that doesn't help them reproduce or decide.

## 0. Is this a follow-up?

Every private submission CCs the reporter, so they already have a copy in their inbox with a subject starting `[Feedback: ...]`. A reply to that email lands on the same thread; a new submission opens a new one and the team has to reconcile them by hand.

If the seed reads like a continuation ("follow-up", "again", "still happening", "update on", "retraction", "root cause", "I already sent", "third time"), or the user filed something on this topic earlier in the session, ask whether they already sent a report about it. If they did, tell them to reply to that email with the new information and stop here. Only file fresh when they confirm it's a different issue.

Never title a report "Follow-up:", "ROOT CAUSE:", or "RETRACTION"; those belong in a reply.

## 1. Gather context (best effort, never block)

Run in parallel; skip anything that fails:

- `superset --version` and `uname -sm` for the environment line
- `superset auth whoami` for the signed-in user/org (private submissions only)
- `superset status --json` for the host service; its `hostServiceVersion` is the desktop app's version when the app spawned the service

Don't include repository contents, terminal output, or logs unless the user explicitly agrees when asked; they can contain private paths and code.

### Version check

Many reports describe bugs already fixed in a newer release. Desktop, CLI, and host service share one version number, so compare what's running against the latest release:

- Latest: `superset update --check --json` (standalone CLI). If it says the CLI is bundled with the desktop app, the CLI version is the app version; get the latest from `gh release download cli-latest -R superset-sh/superset -p version.txt -O -` instead.
- Running: the CLI version, and `hostServiceVersion` from `superset status --json` if it differs.

If anything is behind, say so before drafting and ask whether they want to update first (the desktop app updates itself from its menu; a standalone CLI with `superset update`). If they'd rather file now, note the versions in the report.

### Bugs about hosts, automations, terminals, or remote workspaces

Symptoms like "host not registered", "hosts list is empty", "automations create fails", "host shows offline", "terminal won't attach", or "workspace missing from the sidebar" are the most common reports and usually have a known cause. Before drafting, run the doctor skill's snapshot (`superset status`, `superset auth whoami`, `superset hosts list`) and apply its signature table. If that fixes it, there's nothing to report. If it doesn't, keep the `superset status --json` output for the report; it's what the team asks for first.

### Evidence (bugs only, offer, never assume)

- **Screenshot**: if the bug is visual and you can capture one, offer to attach it. Evidence beats prose.
- **Diagnostics**: offer the `--diagnostics` bundle: versions, OS, and the last 200 lines of the app log and the host-service log. Tell the user logs can contain file paths and project names before they agree. Prefer the bundle over attaching raw log files; attach a file only when the tail isn't enough. Attachments must total under about 3 MB; a single larger log is cut to its tail automatically.

## 2. Classify and draft

Classify as **bug**, **feature request**, or **general feedback** from their words; ask only if genuinely ambiguous.

**One report per root issue, one request per ask.** Two symptoms of the same failure are one bug. Three unrelated wishes are three feature requests; offer to split them, then file each separately. Don't file a second report for a different symptom of something the user just filed.

### Title

`<Surface>: <symptom or ask>`, under 72 characters, no trailing period.

- Surface is the part of Superset involved: Terminal, Sidebar, Browser pane, Workspaces, Automations, CLI, Updater, Mobile, and so on.
- Bugs name the symptom, not the guess at the cause. Requests name the outcome, not the implementation.
- Don't prefix with "Bug:" or "Feature:"; the type is already carried separately.

Good: `Terminal: pane goes blank after waking from sleep`, `Sidebar: let me pin an automation to the top`.
Bad: `Bug with terminal`, `Terminal rendering broken because xterm loses WebGL context on resume`.

### Body

Plain text that also reads well as markdown: section labels on their own line, `-` bullets, numbered steps. No headings, bold, or tables; the private path is delivered as a plain-text email. Keep the user's own words where they're precise, tighten where they ramble. A one-line seed still gets Summary bullets.

Every report starts with a **Summary** of 2-4 bullets that stand alone. Someone reading only those bullets should know what's wrong (or wanted), how bad it is, and how often it happens. Summary bullets are observations, never hypotheses.

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

Investigation
Hypothesis: main.log shows "WebGL context lost" at the moment of wake, so the renderer may not be reacquiring it.

Host status
{"running":true,"healthy":true,"cloudRegistered":false,...}

Environment
Superset 1.21.0, macOS 26.0 arm64
```

- **Investigation** is optional and only for findings the user or you actually made: a log line, a measurement, a code path read from the repo. Label guesses `Hypothesis:`. Never promote them into the title or Summary; reporters have been confidently wrong, and a wrong cause in the title sends triage down the wrong path.
- **Host status** is the `superset status --json` output, only for the bug classes in step 1.
- **Environment** goes in the body only on the public path, or when the desktop app version differs from the CLI version; the private path already appends the CLI version and OS.
- Never submit a checklist with unanswered items ("not yet checked"). Either get the answer or drop the question.

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

Omit any section with nothing to say. Steps, Expected, Actual, Investigation, Host status, and Environment are for bugs only. Target under 150 words; go longer only when the extra words help reproduce.

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
  Only when the user agreed to them in step 1, add `--attach /path/to/screenshot.png` (comma-separated paths, about 3 MB total) and/or `--diagnostics`. The submission is sent from the user's Superset account, a copy is CC'd to them, and the team replies to their account email.
- If the CLI is missing or not logged in (`superset auth whoami` fails), offer `superset auth login` first; if declined, fall back to email: give the user a clickable mailto link (`mailto:support@superset.sh?subject=<url-encoded title>&body=<url-encoded body>`) and also print the raw draft so they can copy it.

**Public path:**
- **Check for duplicates first**: `gh search issues -R superset-sh/superset "<key terms>" --limit 5`. If an existing issue matches, show it and offer to comment there (`gh issue comment`) instead of opening a new one; only create a fresh issue if the user confirms it's genuinely different.
- If `gh` is installed and `gh auth status` succeeds: `gh issue create -R superset-sh/superset --title "..." --body "..."` (write the body via a heredoc or temp file, never inline-escape).
- Otherwise open the prefilled form in the browser: `https://github.com/superset-sh/superset/issues/new?title=<url-encoded>&body=<url-encoded>`.

## 5. Confirm

Report back the issue URL (public) or a confirmation of what was sent and to whom (private). Remind them that more information on the same issue goes as a reply to the CC'd email, not a new report. If anything failed, show the draft so the user's writing is never lost.
