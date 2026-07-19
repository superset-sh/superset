---
title: Performance week (2026-07-19)
date: 2026-07-19
type: tweet
---

We spent this week making Superset lighter and smoother @superset_sh 🛳️

Every hidden terminal used to keep its full scrollback and a GPU context alive forever, so a long session with a lot of background terminals could climb past a gigabyte of memory. Now we keep your recent terminals in memory and rebuild the rest from disk when you come back to them. The process keeps running the whole time. In a 16-terminal test that cut renderer memory from 1,127 MB to 838 MB and JS heap from 581 MB to 286 MB. Tune it in Settings → Terminal → Background terminal memory.

Git status in big repos used to run on the same thread that relays your terminal output, so a branch switch or a burst of file changes could make the app hitch. It runs on a background worker pool now. Profiling 8 workspaces churning a 20k-file repo, the worst-case stall on that thread dropped from 82 ms to 28 ms.

We also cut background CPU from port detection: one shared process scan per tick instead of one per terminal, plus idle terminals that back off on their own.

Every number above was measured live against the real app.

Full changelog: https://superset.sh/changelog/2026-07-19-performance-memory-and-load
