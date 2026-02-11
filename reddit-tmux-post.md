# Reddit Post for r/tmux

## Title
> we built terminal persistence without tmux — curious what we're missing

---

## Post

we're working on an open source terminal ([github.com/superset-sh/superset](https://github.com/superset-sh/superset)) and wanted sessions to survive app restarts by default. no config, just works.

first thought was to wrap tmux but we ran into some issues:

- needed windows support without WSL
- wanted zero config — no `.tmux.conf`, no prefix keys
- getting terminal state (modes, cursor, cwd) out of tmux programmatically was harder than just tracking it ourselves

so [Andreas Asprou](https://github.com/andreasasprou), one of our contributors, built a daemon instead:

```
electron app (can restart) → unix socket → daemon (owns PTYs) → pty subprocesses
```

the interesting bits:

- **headless xterm.js per session** — every byte flows through a headless emulator so we can serialize screen state on reconnect. reconnect is O(screen size) not O(history).

- **two sockets per client** — control and stream are separate so heavy terminal output doesn't block RPC responses (was getting head-of-line blocking before this)

- **cold restore** — scrollback persists to disk. if daemon crashes we restore from disk on next launch

what we gave up vs tmux: no remote attach, no scriptability yet, not general purpose

**curious about:**
1. tmux patterns worth stealing?
2. persistence edge cases to watch for?
3. simpler approach we missed?

[video demo]

all open source if anyone wants to look at the implementation. not trying to get anyone to switch, genuinely want to know if we're overcomplicating this or missing something obvious

---

## Quick Responses

- "just use tmux" → fair, we optimized for zero-config users who don't want to learn tmux
- "electron bloat" → daemon is plain node, electron is just the UI
- "tmux with extra steps" → kind of, but invisible to user — no prefix keys, no config
