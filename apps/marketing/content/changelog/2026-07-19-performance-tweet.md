---
title: Performance week (2026-07-19)
date: 2026-07-19
type: tweet
---

We spent the week making Superset lighter and smoother @superset_sh 🛳️

Every number here is a real before/after, measured on the actual code.

1. Less memory with lots of terminals open 🧠
Every hidden terminal used to keep its full scrollback and a GPU context alive, forever. Long sessions could climb past a gigabyte. Now we keep only your recent terminals in memory and rebuild the rest from disk when you switch back. The process behind each one keeps running, so nothing is lost. With 16 terminals open, memory went from 1,127 MB to 838 MB and heap from 581 MB to 286 MB. That means fewer slowdowns and white-screens, especially on 8 and 16 GB machines. Set the limit in Settings → Terminal → Background terminal memory.

2. No more hitching from git 🌿
In big repos, git status used to run on the same thread that streams your terminal output. A branch switch or a burst of file changes could make the app stutter. It runs on a background worker pool now. Profiling 8 workspaces churning a 20k-file repo, the worst-case stall on that thread dropped from 82 ms to 28 ms.

3. Quieter in the background 🔋
Port detection used to scan the whole process table once per terminal. Now it runs one shared scan per cycle. With 15 terminals open that went from 15 scans per cycle down to 1, and idle terminals scan 12x less often. Less background CPU, so quieter fans and better battery.

Full changelog: https://superset.sh/changelog/2026-07-19-performance-memory-and-load
