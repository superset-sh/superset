# Reddit Post for r/GoogleAntigravityIDE

## Title
> built a terminal where your agent sessions survive app closes and crashes

---

## Post

one thing that's been annoying me with long-running agents: accidentally closing the terminal or needing to restart kills whatever the agent was doing.

built a terminal where sessions persist by default. close the app, reopen, agent is still running. even if the app crashes, scrollback restores from disk.

**how it works:**

- terminals run in a background daemon that survives app restarts
- when you reopen, it reconnects to existing sessions
- no tmux, no config, just works

**why it's useful for agent workflows:**

- agents can run for hours without you babysitting the window
- app updates don't kill your session
- spin up isolated workspaces (git worktrees) for different agent tasks
- crash recovery — at minimum you get your scrollback back

[video demo]

open source: [github.com/superset-sh/superset](https://github.com/superset-sh/superset)

anyone else losing agent sessions to accidental closes? curious how others are handling this

---

## Shorter Version

agents running long tasks + accidentally closing your terminal = pain

built a terminal where sessions persist by default. close app, reopen, still running. crashes restore from disk.

no tmux. no config.

[video]

[github.com/superset-sh/superset](https://github.com/superset-sh/superset)

---

## Quick Responses

- "antigravity has its own terminal" → yeah this is for when you want to run agents in a standalone terminal or alongside other tools
- "just use tmux" → works but requires setup, this is zero-config
- "does it work with gemini CLI" → it's a full terminal, works with anything
