# Reddit Post for r/vibecoding

## Title
> made a terminal that doesn't kill your session when you accidentally close it

---

## Post

got tired of accidentally closing my terminal while an agent was mid-task.

built a terminal where sessions run in a background daemon. close the app, reopen, everything's still there. even crashes restore scrollback from disk.

no tmux, no config. persistence is just on by default.

also has isolated workspaces — each one is a separate git branch with its own files, so you can have multiple agents working on different features without them conflicting.

[video demo]

open source: [github.com/superset-sh/superset](https://github.com/superset-sh/superset)
