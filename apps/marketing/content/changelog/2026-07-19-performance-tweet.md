---
title: Performance week (2026-07-19)
date: 2026-07-19
type: tweet
---

We spent the week making Superset lighter and smoother @superset_sh 🛳️

Real before/after numbers, measured on the actual code:

1. 26% less memory 🧠
1,127 → 838 MB with 16 terminals open. Fewer slowdowns and white-screens on 8 and 16 GB machines.

2. 3x smaller git stalls 🌿
82 → 28 ms when git churns in a big repo. No more hitching on branch switches.

3. Quieter in the background 🔋
15x fewer background scans from port detection. Less CPU, better battery.

Full changelog: https://superset.sh/changelog/2026-07-19-performance-memory-and-load
