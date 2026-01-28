# Reddit Post for r/ClaudeCode

## Title
> I built a terminal that won't kill your Claude Code sessions when you close or update

---

## Post

if you've ever accidentally closed your terminal mid-task or had to restart for an update while claude was working, you know the pain.

we built a terminal where sessions persist by default. close the app, reopen it, claude is still running. even if the app crashes, we restore your scrollback from disk.

**how it works:**

terminals run in a background daemon that survives app restarts. when you reopen, it reconnects to your existing sessions. no tmux, no config, just works.

**why this matters for claude code:**

- close your laptop, come back, claude is still going
- app updates don't interrupt long-running tasks
- crash? you still get your scrollback back
- run multiple claude sessions in isolated workspaces (git worktrees)

[video demo — closing app completely, reopening, session still running]

it's open source: [github.com/superset-sh/superset](https://github.com/superset-sh/superset)

curious if others have run into the "accidentally killed claude mid-task" problem and how you've dealt with it

---

## Alternative Shorter Version

if you've accidentally closed your terminal while claude was mid-task, this is for you.

built a terminal where sessions persist by default. close the app, reopen, claude is still running. even survives crashes.

no tmux. no config. just works.

[video]

open source: [github.com/superset-sh/superset](https://github.com/superset-sh/superset)

---

## Quick Responses

- "just use tmux" → works but requires setup. this is zero-config, persistence is just on by default
- "how does it work" → daemon owns the PTY processes, app is just a client that can reconnect
- "does it work with other CLIs" → yeah it's a full terminal, not claude-specific
