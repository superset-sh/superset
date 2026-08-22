# Quota-Tracker Marketing Research — AI Subscription Usage Tools

*2026-08-16. Research for Superset's Usage tab (per-account quota % + reset countdowns for Claude Code and Codex, read from local CLI logins) and the future model-dropdown quota meter.*

Sources: five repos cloned to `/tmp/quota-tools-research/` (runway, CodexBar, claudebar, ai-usagebar, omarchy-ai-usage), ccusage README, HN/Reddit threads, X replies to Theo's T3 Code usage-page tweet (retrieved via X API), steipete.me. All quotes verbatim with links.

---

## 1. Per-tool positioning + feature matrix

### Positioning at a glance

| Tool | Stars | Headline pitch | What they lead with |
|---|---|---|---|
| **CodexBar** (steipete) | 20,145 | "Every AI coding limit, in your menu bar. — May your tokens never run out." | Provider breadth (69 providers), plan-around-resets, privacy-first ("without having to login") |
| **ccusage** (ryoppippi) | 17,955 | "Analyze coding (agent) CLI token usage and costs from local data" | Zero-install `npx ccusage`, cost-vs-API-savings on Max plans, 5-hour billing blocks, 16+ agent CLIs, offline |
| **ai-usagebar** (akitaonrails) | 274 | Native Omarchy panel + Waybar widget + tabbed TUI for AI plan usage | Rust rewrite of claudebar, drop-in compatible, multi-surface (panel/bar/TUI), multi-provider, multi Claude accounts |
| **claudebar** (mryll) | 46 | "Waybar widget that shows your Claude AI usage limits — session, weekly, per-model — with colored progress bars and countdown timers" | Pure Bash, zero deps, deep format customization, pacing math |
| **runway** (mstallone) | 42 | "Fast, observable AI usage across every provider and account, right from the macOS menu bar" | Speed benchmarks vs upstream fork (0.29s launch vs 5.4s, 238MB vs 1.09GB RAM), multi-account per provider, no analytics |
| **omarchy-ai-usage** (rodrigo-sntg) | 4 | "AI usage monitoring for Omarchy — track your rate limits directly from Waybar" | CodexBar-for-Linux clone: notifications, sparkline history, TUI |

Positioning notes:
- **CodexBar** won on breadth + no-login. Its "Why" section is four bullets: *plan around resets* ("stop guessing whether to start that long task"), credits/spend, live provider-status incidents, privacy-first. Peter's precursor (Vibe Meter) pitch: "I needed a simple way to track AI spending without constantly checking dashboards" ([steipete.me](https://steipete.me/posts/2025/vibe-meter-monitor-your-ai-costs)). No dedicated CodexBar blog post exists; positioning lives entirely in README/codexbar.app. It spawned a whole ecosystem of community ports (Windows, Android, GNOME, KDE, Waybar, tmux) built on its CLI's JSON output — the CLI-as-platform move is what made it a category standard.
- **runway** is positioned *against* bloat — its README opens with a benchmark table (launch time, popover latency, RAM) because CodexBar/OpenUsage's resource use is the category's best-known wound.
- **ccusage** is the OG: local-log cost analysis, not live quota. Its viral hook was never "avoid limits" — it was "look how much my $200 Max plan would cost at API rates."
- **claudebar/ai-usagebar/omarchy-ai-usage** are the Linux answer; all three cite CodexBar/claudebar lineage in their READMEs. Notably they hit the same undocumented `api.anthropic.com/api/oauth/usage` endpoint Superset uses, and document its aggressive rate limits (429s below ~300s polling).

### Feature matrix

| Feature | CodexBar | runway | claudebar | ai-usagebar | omarchy-ai-usage | ccusage |
|---|---|---|---|---|---|---|
| Quota % + reset countdown | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ blocks only |
| Providers | 69 | 12 | 1 (Claude) | ~17 | 4 | 16+ CLIs (logs) |
| Pace indicators ("will I run out?") | ✅ (+community ports) | ✅ | ✅ ratio + point-based, tolerance bands | ✅ (inherited) | ❌ | ❌ |
| Near-limit notifications | ✅ session quota + weekly-reset confetti | ✅ 3 pace-aware alerts: Almost Out / Cutting It Close / Will Run Out (default off) | ❌ (bar color) | ❌ (bar color) | ✅ 80%/95% thresholds + cooldown | ❌ |
| Menu-bar/panel pinning | ✅ per-provider items or Merge Icons | ✅ pin up to 2 metrics/provider, text or mini-bars | ✅ Waybar | ✅ Waybar/Quattro/GNOME/macOS | ✅ Waybar | ❌ CLI |
| Multi-account per provider | partial (token-account settings) | ✅ core pitch, rename account cards | ❌ | ✅ named Claude accounts, per-account tabs | ❌ | ❌ |
| No-login / reuse local creds | ✅ core pitch | ✅ ("no extra login") | ✅ reads `~/.claude/.credentials.json` | ✅ | ✅ | ✅ local logs only |
| Screen-share masking | ❌ | ✅ auto-swaps strip to wordmark during capture | ❌ | ❌ | ❌ | ❌ |
| CLI / scriptable JSON | ✅ `codexbar` (macOS+Linux), basis of all ports | ✅ one-shot `runway` CLI, cached | ✅ (is a CLI) | ✅ `--json`, `usage --json` | ✅ scripts | ✅ (is a CLI) |
| Local HTTP API | ✅ `codexbar serve` | ✅ `127.0.0.1:6736/v1/limits` | ❌ | ❌ | ❌ | ❌ |
| iOS companion / sync | ❌ (WidgetKit only) | ✅ iOS app + lock-screen widgets, private iCloud sync | ❌ | ❌ | ❌ | ❌ |
| Cost estimates from local logs | ✅ 7/30-day, SQLite-capped | ✅ Today/Yesterday/30d tiles, native (no Node) | ❌ | ⚠️ context overlay only | ❌ | ✅ core feature |
| Usage history / sparklines | ✅ charts | ✅ iOS trend chart | ❌ | ❌ | ✅ ▁▂▃▄▅▆▇█ | ✅ reports |
| Theming | ✅ 21 languages, display controls | ✅ native settings | ✅ Omarchy theme auto-detect + CSS classes | ✅ Omarchy/One Dark | ✅ auto GTK dark/light | ❌ |
| Provider status/incident polling | ✅ badges + icon overlay | ❌ | ⚠️ 429 fallback indicator | ⚠️ stale markers | ⚠️ retry/backoff | ❌ |
| Platform | macOS app; CLI macOS+Linux | macOS 15+; iOS | Linux/Waybar | Linux + macOS + Windows(TUI) | Arch/Omarchy | anywhere (Node) |
| Stale-while-revalidate cache | ✅ adaptive refresh | ✅ instant cached paint, 5-min refresh | ✅ 60s TTL | ✅ atomic + flock | ✅ configurable TTL | n/a |

### Features we hadn't considered (idea bank)

1. **Runway "Memory Explorer"** — a window that discovers every agent memory/instruction file on disk (CLAUDE.md, per-project memories, AGENTS.md, GEMINI.md), with edit/create/delete and an index-sync for Claude's MEMORY.md. Adjacent to usage, same "one place to see agent state" instinct.
2. **Screen-share masking** (runway) — auto-hide usage numbers when macOS reports screen capture; "Token counts and spend never show up in front of an audience." Cheap, delightful, demo-friendly.
3. **Pace-aware notifications** (runway) — not just thresholds: "Will Run Out" *projects* whether you'll exhaust before reset; dedup + re-arm semantics carefully specified.
4. **Pacing indicators** (claudebar) — ↑/→/↓ vs even burn-rate, with tolerance bands and an elapsed-time marker rendered inside the progress bar. Answers "at this rate, will I run out before reset?"
5. **"Remaining" battery framing** (claudebar `--remaining`) — flip from "42% used" to "58% left"; some users think in headroom, not consumption.
6. **Weekly-reset confetti** (CodexBar) — celebration on reset; the reset moment is an emotional event.
7. **Local HTTP API + one-shot CLI for agents** (runway/CodexBar) — *agents themselves* read quota JSON to decide pacing. `codexbar serve` powers ~10 community ports.
8. **iCloud-synced iOS widgets** (runway) — spend/usage on the lock screen, combined across Macs, private CloudKit.
9. **Provider incident badges** (CodexBar) — distinguishes "you're throttled" from "Anthropic is down."
10. **Usage history sparklines + clipboard export** (omarchy-ai-usage).
11. **Auto OAuth token refresh** (claudebar et al.) — refresh the CLI's token when near expiry so the meter never dies while the user is away.
12. **Merge Icons / provider cycling** (CodexBar, ai-usagebar) — one compact item cycling providers, for menu-bar real-estate anxiety.

### What they say about privacy/ToS

- **CodexBar**: dedicated "Privacy note" — "It doesn't crawl your filesystem; it reads a small set of known locations… no passwords are stored"; documents every macOS permission and why; points at a community audit ([issue #12](https://github.com/steipete/CodexBar/issues/12)). Agent-aware refresh *asks before* inspecting the process list.
- **runway**: "Runway collects no product analytics or usage statistics" — no crash reporting, no identifiers; deleted the retired analytics ID on upgrade. Claude access "strictly read-only… Claude owns its logins and their rotation." iCloud sync documented as never developer-visible.
- **claudebar**: warns the `/api/oauth/usage` endpoint is "undocumented and has aggressive rate limits" (links anthropics/claude-code#30930) — honest about fragility rather than about ToS.
- **Community ToS anxiety is real**: "Is codexBar (Claude usage tracker) safe to use?" ([r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1qrlf00)); a Windows-widgets author: "Technically, this is against Anthropic's policy, so be aware" ([r/SideProject](https://www.reddit.com/r/SideProject/comments/1rfakqf)). Nobody has a clean answer; the winning tools answer it with *read-only, local-only, open-source*.

---

## 2. Ranked: what people love (with real quotes)

**#1 — Cost-vs-API-savings framing + vanity token counts** (highest engagement; ccusage's whole growth loop)
- "TIL I spent $7000 worth of tokens in the last month. Awesome project!" — [r/ClaudeAI on ccusage](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
- "my total tokens used since I started using Claude Code on May 27th was 1,374,439,311 worth around $3397.34" — joshmlewis, [HN](https://news.ycombinator.com/item?id=44317012)
- "I'm on the $100/mo Max plan and have been running $600-800/mo in terms of usage" — extr, [HN ccusage thread](https://news.ycombinator.com/item?id=44610925)
- "cause it's fun to see how much tokens people are guzzling down" — viberank author, [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1lqfcn8)
- ⚠️ Double-edged: see complaint #7 (flexing invites clampdowns).

**#2 — Limit-anxiety relief** (the founding story of nearly every tool)
- "I kept slamming into Claude Code limits mid-session and couldn't find a quick way to see how close I was getting" — Claude Code Usage Monitor author, [HN 245pts](https://news.ycombinator.com/item?id=44317012)
- "very frustrating to get only the Approaching Limit - Usage Will Reset at X time (a few hours wait)" — [r/ClaudeAI](https://safereddit.com/r/ClaudeAI/comments/1lh71x0)
- "I've often exceeded the limit mid-process" — [HN, claudecodeusage 161pts](https://news.ycombinator.com/item?id=46544524)

**#3 — Glanceability / zero-click visibility**
- "Love it, installed and set it to run at Login… I had to always go to claude settings for this." — [HN](https://news.ycombinator.com/item?id=46544524)
- "I was frustrated with recent OpenAI changes to add one more click to look into usage limits. So I made a solution that requires 0 clicks" — Codex Minibar author, [r/codex](https://www.reddit.com/r/codex/comments/1uvfhde)
- "man do I just want a way to quickly glance at my API credits" — teekert, [HN](https://news.ycombinator.com/item?id=44317012)
- "I needed a simple way to track AI spending without constantly checking dashboards" — steipete, [Vibe Meter post](https://steipete.me/posts/2025/vibe-meter-monitor-your-ai-costs)

**#4 — Multi-account / multi-provider juggling** (fastest-growing unmet demand)
- "particularly when you pair it with CodexBar and can easily see your token spend across multiple subscriptions" — mrshu, HN
- "This isn't taking my other account into consideration. I have work and personal separate codex subs" — [X reply to Theo](https://x.com/iM_Nizam10/status/2086786420883202458)
- "Do you guys have native multi-account yet? The one thing I can't do without" — [X](https://x.com/JJdoesTech/status/2086783228950482972). **Theo's answer: "Don't do multi account in app, makes no sense with how harnesses work. CLIProxyAPI is what you want"** ([X](https://x.com/theo/status/2086873017439891895)) — he punted on exactly the thing Superset can do.
- "I have 2 devices one for work and one for personal projects and it would be great if I can track on both" — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)

**#5 — Cross-machine/cross-surface aggregation** (the praised differentiator in Theo's launch)
- "the cross-machine history is the actual feature here" — [X reply](https://x.com/JulienZammit1/status/2086620179493011694)
- Theo's own hook: "uses the actual Claude and Codex history on all your machines, not just the T3 Code usage" — [tweet](https://x.com/theo/status/2086053137115406588)
- "This is the kind of usage dashboard developers actually need. Clean, detailed, and genuinely useful." — [X](https://x.com/Juice_LabAKM/status/2086388017191899638)

**#6 — Free / open-source / zero-install / small-enough-to-audit**
- "I really like how easy it is to run using bunx, pnpx, npx, etc." — [HN on ccusage](https://news.ycombinator.com/item?id=44610925)
- "the entire source is ~400 lines of Swift" (smallness as trust) — [HN](https://news.ycombinator.com/item?id=46544524); cf. "Show HN: A Claude usage menu bar small enough to read before you run it" ([HN](https://news.ycombinator.com/item?id=49210250))

**#7 — Privacy / local-only / no-login** (mostly maker-side positioning, but it answers a real trust objection)
- CodexBar's repo description *is* the pitch: "Show usage stats for OpenAI Codex and Claude Code, **without having to login**"
- "The token never leaves your machine except to Anthropic's own API endpoint" — dev, [HN](https://news.ycombinator.com/item?id=46544524)

**#8 — Reset-timer planning** (weakest standalone theme; usually bundled into glanceability — but it was the top ask in Theo's replies)
- "Will we be able to see our usage limits in there and codex resets?" — [X reply to Theo](https://x.com/thejoaosv/status/2086402203309289979)
- CodexBar's "Why": "stop guessing whether to start that long task"
- Whole products exist on this framing (AgentPace "Know when you'll run out", codexrunway.com "Does Codex Reset Today?") but organic user quotes are scarce.

**Meta-theme: users think vendors should ship this natively**
- "they really should integrate this kind of thing, it is very annoying" — waynenilsen, [HN](https://news.ycombinator.com/item?id=44317012). An IDE that has it built in (Superset) *is* the native version.

---

## 3. Complaints / gaps (= positioning openings)

1. **Inaccurate estimates vs official numbers** — the #1 credibility killer for log-parsing tools.
   - "the live count is completely inaccurate. I just approached my usage limit and ccusage is showing only 15% usage lol" — [r/ClaudeAI](https://safereddit.com/r/ClaudeAI/comments/1lh71x0)
   - "Today I updated ccusage and my total cost went down from 10k to 7k… I guess it was counting duplicate tokens" — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
   - Loudest reply to Theo's launch: "Is it possible that this is actually correct @theo?" — [quote tweet](https://x.com/orcdev/status/2086238306002407649); a user found JSONL duplicate usage-object double counting: "Collapsing them on the message id cut my totals by ~2x" — [X](https://x.com/underemployed/status/2086509412018008264)
   - → Superset opening: we read the **provider's own quota %** (the same numbers the CLI enforces), not log-derived estimates. Say so loudly.
2. **Memory/CPU bloat** — CodexBar's biggest liability; competitors position directly against it.
   - "The fact that Codexbar takes 7GB of RAM on macOS shows just how little attention to performance/design he pays" — behnamoh, HN
   - "just like CodexBar but uses 0% CPU and 31MB" — CodexPeek pitch, [r/codex](https://www.reddit.com/r/codex/comments/1rq9z6l); runway's whole README opens with the RAM benchmark.
   - → Superset opening: zero extra processes — it lives in the IDE you already run.
3. **Keychain prompts / credential fear / ToS anxiety**
   - "i'm fed up with the keychain prompt" — [r/codex](https://www.reddit.com/r/codex/comments/1r6z1kl); "Is codexBar… safe to use?" — [r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1qrlf00)
   - "Getting people used to just running code like this that has full access to the system is slightly concerning" — [HN](https://news.ycombinator.com/item?id=44610925)
4. **Breaks when providers change formats/endpoints** — structural fragility of the whole category.
   - "Just days after launch, Anthropic removed the costUSD field from logs. Panic mode!" — ryoppippi, [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
   - claudebar's README warns of 429s on the undocumented usage endpoint below 300s polling.
5. **Platform gaps** — macOS-only spawned a Windows/Android/Linux clone economy ("I built them because I was jealous of all these Mac users sharing their fancy CodexBar app" — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1rfakqf)). Superset ships cross-platform by default.
6. **Scope confusion + coverage gaps** — Theo's repliers immediately asked *what's counted*: "Does it only count the tokens spent through t3code or with any codex/claude usage on the machine?" ([X](https://x.com/khalilabdalmje1/status/2086494091638927369)); "Seems like the Claude one is only seeing the default Claude profile and not my 2 custom profiles" ([X](https://x.com/_watzon/status/2086471687907004896)); "Why doesn't it pick up OpenCode usage?" ([X](https://x.com/AmmarAliShahK/status/2086451821867077963)). Label scope explicitly; handle `CLAUDE_CONFIG_DIR` profiles.
7. **Usage-flexing backlash** — "People spending $5000 of tokens and paying $200 is why we can't have nice things" / "Now everyone will have weekly limits." — [viberank thread](https://www.reddit.com/r/ClaudeAI/comments/1lqfcn8); "you guys yelling about it so loudly from the rooftops is really really not helping your case lol" — swyx, [HN](https://news.ycombinator.com/item?id=44610925). Marketing implication: frame around *planning and headroom*, not bragging about extraction.
8. **Vibe-coded clone fatigue** — "a simple search shows at least a dozen same/similar (better?) solutions" ([HN](https://news.ycombinator.com/item?id=46544524)). Standalone meters are commoditized; the durable position is a meter *attached to an orchestrator that acts on it*.

---

## 4. Implications for Superset

### The unique angle (lead with it)
**No menu-bar app can act on the number.** Every tool above ends at "look at the meter." Superset closes the loop: the same surface that shows per-account quota % *starts agents* — so the model dropdown can rank accounts by headroom and the orchestrator can route work to the account with the most runway. Theo explicitly punted on multi-account ("makes no sense with how harnesses work"); for an agent orchestrator it makes *perfect* sense, and it's our moat.

### Value props to emphasize, in order
1. **Pick the account with the most headroom** — multi-account is the #4 loved theme and the top unanswered ask in Theo's replies. "Start this agent on the login that won't run out."
2. **Official numbers, not estimates** — we show the provider's own quota % (what the CLI itself enforces), sidestepping the category's #1 complaint. Copy: "the same limit Claude Code sees — not a log-file guess."
3. **Plan around resets** — reset countdowns answer "do I start the big refactor now or after reset?" (CodexBar's own "stop guessing whether to start that long task"). For us: "queue the long job for after reset" is a natural automation follow-up.
4. **Zero extra apps, zero login, zero RAM tax** — reads the CLI logins already on disk; no new process (vs "7GB of RAM"), no keychain prompt anxiety, no menu-bar clutter.
5. **Fleet-level anxiety relief** — running 10 agents in parallel burns quota 10x faster; the person most in need of a quota meter is precisely a Superset user. "Know your burn rate before your agents do."

### Marketing language grounded in user quotes
- "Stop slamming into limits mid-session." (mirrors the 245-pt HN founding story)
- "Know whether to start the long task." (CodexBar's proven line)
- "Your real quota — the number Claude Code enforces — not a token-log estimate." (answers "is this actually correct?")
- "Work and personal subs, side by side. Start the agent on whichever has headroom." (mirrors "I have work and personal separate codex subs")
- "No new app. No login. Nothing leaves your machine." (category trust language: no-login + local-only)
- Avoid: leaderboard/bragging framings ("guzzling tokens") — the community actively fears flexing invites tighter limits. Frame as *planning*, not extraction.

### Feature roadmap candidates (borrowed from the field, ranked by fit)
1. **Model-dropdown quota meter + headroom-ranked account picker** (unique; ship next).
2. **Pace projection** ("at this burn rate you'll hit the weekly cap Thursday") — claudebar/runway pacing math; pairs naturally with parallel-agent burn.
3. **Near-limit notifications** with runway's semantics (Almost Out / Will Run Out; projected, deduped, default sensible) — surfaced through Superset's existing notification system.
4. **Scope + profile clarity** — enumerate all `CLAUDE_CONFIG_DIR`/`~/.codex` logins; label exactly what's counted (Theo's repliers demanded this within hours).
5. **Agent-readable quota** — expose quota via superset CLI/MCP so agents can self-pace or defer big jobs until reset (CodexBar's `serve` proved the demand; ~10 community ports built on it).
6. **Screen-share masking** for the Usage tab / any pinned meter (runway; cheap and demo-day-delightful).
7. **Reset-moment affordances** — "resumes at 3:00 PM" countdown → optional auto-start of queued work at reset (nobody has this; it's orchestrator-shaped).
8. Later/nice: usage history sparklines, weekly-reset confetti, provider incident badges ("Anthropic is down" ≠ "you're throttled").

### Positioning sentence (draft)
> Superset shows each account's real quota — the same % Claude Code and Codex enforce — with reset countdowns, right where you launch agents. Start every agent on the account with the most headroom.

---

## Competitive re-check 2026-08-16

*Re-run against Superset's now-shipped Usage feature (PR #6530): per-account official quota % (Claude `oauth/usage` + Codex `wham/usage`, read-only tokens, multi-account auto-discovery incl. `CLAUDE_CONFIG_DIR` profiles + per-profile keychain + `~/.codex*` homes), transcript-derived token/cost history verified token-exact vs ccusage (last-wins dedupe, per-tier cache-write pricing, Codex delta dedupe), single-screen dashboard (layered per-provider area chart, series toggles, click-a-day inspection, stat strip w/ cache savings $, model table, per-workspace attribution via host.db worktree paths), drilldown pages per workspace and per model, "Cost to you: $0" subscription framing.*

### What moved since ~Aug 10

- **CodexBar** ships ~daily (0.49.1 → 0.51.0, Aug 16). New: cost history moved to a single SQLite store + QuickJS **provider plugin engine**; **duplicate usage rows collapsed across Macs** (0.49.2) + **SSH hosts** = real multi-machine; **Tokens/Cost toggle on daily charts + compact "run-out forecast" token** (predicted time until quota exhausts, 0.50.0); optional **model-scoped weekly quota** in widgets; Claude OAuth fallback when Keychain access is revoked; CLI session grouping. Also partial provider-side budget surfacing (Bedrock, LiteLLM, ClawRouter).
- **runway**: v0.8.3–0.8.10 since Aug 1 — **iOS companion app w/ CloudKit sync + lock-screen widgets** (multi-Mac aggregation), **Memory Explorer** (⌘M, browse/edit every harness's memory files), popup perf 84→35ms, then three straight releases of **Keychain hardening** (durable approvals, silent reads, strictly read-only, no `/usr/bin/security`). Unreleased Aug 14 batch is provider plumbing (Copilot org seats, OpenCode official usage API, Z.ai credit limits, OpenRouter key-limit meter).
- **ai-usagebar**: hit **1.0.0 (Aug 14)** with a native Omarchy 4 "Quattro" Quickshell panel; ~18 vendors now (added SuperGrok, Kiro); 1.0.1–1.0.3 all security hardening (Keychain via Security.framework, config chmod 600 fail-closed, no key inheritance into subprocesses). Still unique: **Claude Code context-window overlay** (% of context used per live session, from local JSONL).
- **claudebar** dormant since Jul 8; **omarchy-ai-usage** dormant since Feb. The incumbent one-trick tier (hamed-elfayome 3,270★, phuryn 2,147★) also quiet since early July.
- **Cross-cutting theme of the week: credential-safety hardening.** runway, CodexBar, and ai-usagebar all shipped Keychain-prompt/read-only-token work within days of each other. Our "read-only tokens, nothing leaves your machine" stance is now table-stakes messaging — say it explicitly or look behind.

### ccusage v20 (now a Rust binary; npm is a launcher)

- **Per-project: yes** — `daily --instances` groups by project, `--project NAME` filters, `--project-aliases` renames. Session-level reports too. (Closest anyone gets to our per-workspace attribution; still path-inferred project names, no workspace/orchestrator join.)
- **Blocks pace math** (`rust/crates/ccusage/src/blocks.rs`): burn rate = total tokens ÷ minutes between first and last entry of the active 5h block (cache-excluded rate drives the 🟢/⚠️/🚨 indicator: <2000, <5000, else); projection = linear extrapolation to block end (`current + rate × remaining_min`, same for cost); token limit = `--token-limit N|max`, defaulting to **max total of any completed block in history**; output adds remaining-% and "PROJECTED (assuming current burn rate)" rows. Trivially portable math.
- **Statusline: first-class.** `ccusage statusline` reads Claude Code's statusline-hook JSON: model (+reasoning effort) | session/today/block cost (+time left in block) | $/hr burn w/ indicator | context % with color thresholds; mtime-cached at 1s so the hook stays fast.
- **Removed:** `blocks --live` (gone in v18) and the **MCP server** (did not survive the Rust rewrite) — MCP/agent-readable usage is an open lane again.
- Also: 16 agent-CLI adapters incl. **codex** (fork/replay dedupe, service-tier pricing), combined all-agents default report, embedded offline pricing snapshots, `--json` + built-in `--jq`.

### T3 Code usage page since launch (merged PRs, Aug 8–15)

Transcript-derived dollar-cost camp, iterated daily: **mobile usage dashboards** (iOS #5933, cross-platform #5743), **hourly past-24h view** (#6170), and a run of accuracy fixes that validate our verification-first approach — **forked-Codex-session double counting** (#5887), totals jumping while devices report in (#5772), chart bias (#5697), timezone fallback (#6670). Their moat play is cross-machine aggregation + mobile; still **no official quota %**, and the "is this actually correct?" reply remains their loudest launch feedback. No changelog page exists (t3.codes/changelog 404s).

### New market entrants (Jul 15 – Aug 15): ~25 new trackers

- **Hardware desk meters are a real micro-trend**: vibepulse (82★ in 4 days — AMOLED shelf display w/ "NEEDS YOU" agent-waiting alert), clawdmeter-plus (87★), esp32-claude-quota, agentmeter, usage-display, TRMNL e-ink. Quota anxiety is now a desk ornament; the "NEEDS YOU" alert is notably orchestrator-shaped.
- **SessionWatcher** (sessionwatcher.com, $6.99 one-time, 12 tools, pre-lockout notifications) — first serious *commercial* challenger, running aggressive "vs CodexBar" SEO dated mid-Aug.
- **tokenmaxx** (RubricLab, 33★) — local proxy aggregating **multiple Claude + Codex accounts**; **AgentCodeGUI** (69★, Show HN Aug 3) — multi-account desktop GUI. Multi-account demand keeps compounding.
- **claude-statusline-burnrate** (21★, "Stop opening /usage") — weekly-limit pacing math (today's share, sustainable burn, sleep-aware) in a bash statusline; the official-quota-%-pacing thesis productized. Plus codex-limits (46★, pacing-focused menu bar), NerfTrack (36★, "API-equivalent weekly value" = our $0 framing as a standalone product), tare (usage forensics: "ask Claude where your usage went"), ApexGauge (Apple Watch face).
- **herdr-agent-usage** (21★) — someone built usage tracking *for Herdr's ecosystem* before Herdr shipped it natively. The window for "IDE with native usage" being novel is open but closing.

### Feature-gap matrix (re-checked)

| Capability | CodexBar | runway | ccusage v20 | T3 Code | ai-usagebar | Others | **Superset** | Priority to add |
|---|---|---|---|---|---|---|---|---|
| Official quota % | ✅ 69 prov. | ✅ 12 prov. | ❌ | ❌ | ✅ ~18 | claudebar, SessionWatcher | ✅ Claude+Codex | shipped |
| Reset countdowns | ✅ | ✅ | ⚠️ block end only | ❌ | ✅ | most quota tools | ✅ | shipped |
| Pace / run-out projection | ✅ forecast token (0.50.0) | ✅ "N% left at reset" | ✅ blocks linear proj. | ❌ | ✅ inherited | burnrate statusline | ❌ | **P1** |
| Near-limit notifications | ✅ + reset confetti | ✅ 3 pace-aware alerts | ❌ | ❌ | ❌ | omarchy 80/95%+cooldown, SessionWatcher | ❌ | **P1** |
| Tray / ambient display | ✅ | ✅ | ❌ | ❌ | ✅ panels | all menu-bar tools | ❌ (in-IDE tab only) | **P2** — model-dropdown quota chip is our equivalent |
| Statusline integration | ⚠️ via ecosystem | ⚠️ CLI/HTTP feedable | ✅ first-class | ❌ | ⚠️ JSON | burnrate | ❌ | P3 (terminal statusline = our surface) |
| Multi-account | ✅ | ✅ core pitch | ❌ | ❌ (users complained) | ✅ named accounts | tokenmaxx, AgentCodeGUI | ✅ auto-discovery, profiles+keychain | shipped — deepest discovery in category |
| Multi-machine | ✅ SSH hosts + dedupe | ✅ iCloud→iOS | ❌ | ✅ core moat | ❌ | — | ❌ (local host.db) | **P1** — we already have multi-host |
| Cost history accuracy | ⚠️ SQLite, dup-fix just landed | ⚠️ native est. | ✅ reference impl | ⚠️ string of double-count fixes | ⚠️ partial | — | ✅ token-exact vs ccusage, dedupe verified | shipped — our proof point |
| Per-project | ❌ | ❌ | ✅ `--instances` | ❌ | ❌ | — | ⚠️ via workspace | covered by workspace |
| Per-workspace attribution | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ **only us** | shipped — unique |
| Drilldown pages (workspace/model) | ⚠️ hover cards, charts | ⚠️ tiles | ⚠️ CLI reports | ⚠️ pages, hourly view | ❌ | — | ✅ cross-linked pages | shipped; steal T3's hourly 24h view (P3) |
| Budgets / user-set caps | ⚠️ provider-side only | ❌ | ⚠️ token-limit compare | ❌ | ❌ | — | ❌ | P2 — **nobody has real caps**; orchestrator can *enforce* ("stop launching at 90%") |
| CSV export | ❌ | ❌ | ⚠️ JSON+jq | ❌ | ❌ | omarchy clipboard | ❌ | P3 (JSON first) |
| Agent-readable quota (CLI/MCP/HTTP) | ✅ `serve`, ~10 ports built on it | ✅ HTTP :6736 | ❌ (MCP removed in v20) | ❌ | ⚠️ `--json` | — | ❌ | **P2** — ccusage vacated the MCP lane |
| API-org admin reports | ❌ | ❌ | ❌ | ❌ | ⚠️ Anthropic-API org spend | first-party consoles only | ❌ | P4 |
| Context-window overlay | ❌ | ❌ | ⚠️ statusline % | ❌ | ✅ unique | — | ❌ | P3 adjacent |
| Screen-share masking | ❌ | ✅ | ❌ | ❌ | ❌ | — | ❌ | P4 cheap delight |

### Gaps worth stealing, ranked

1. **Pace / run-out projection** — the whole field converged on it this month (CodexBar forecast token, runway projections, ccusage blocks, burnrate statusline). ccusage's math is a portable afternoon: burn rate over active window, linear extrapolation, compare to limit. Ours is *better-grounded*: we can project against the **official quota %** instead of guessed token limits, and parallel-agent burn makes projection existential for our users.
2. **Near-limit notifications** — runway's semantics are the spec to copy (Almost Out / Cutting It Close / **Will Run Out** = projected-before-reset, deduped, re-arm on recovery, default off). We already own a notification system; wire quota into it.
3. **Multi-machine aggregation** — T3's stated moat, CodexBar just shipped it (SSH hosts + cross-Mac dedupe), runway does it via iCloud. Superset **already has registered hosts** — rolling quota/usage up across them is structurally easier for us than for any menu-bar app.
4. **Agent-readable quota via superset CLI/MCP** — CodexBar's `serve` spawned ~10 community ports; ccusage *removed* its MCP server in the Rust rewrite, vacating the lane. Agents that check their own headroom before starting long tasks is orchestrator-native.
5. **Quota-aware caps/routing** — nobody has user-set budgets or enforcement. A meter can only alarm; we can *act*: stop launching / reroute to the account with headroom at a threshold. First-mover claim available.
6. **T3's hourly last-24h view** + ccusage's session/5h-block lens — cheap additions to our existing chart.
7. **Screen-share masking** (runway) and context-window overlay (ai-usagebar) — small, memorable.

### Unique to us (nobody else has, verified this pass)

1. **Per-workspace attribution** — joined against real orchestrator state (host.db worktree paths), with drilldowns. ccusage's `--instances` is path-inference; no one else even tries.
2. **Official quota % + verified-exact cost history in one surface.** Every competitor picks a camp (quota-% menu bars vs transcript-cost analyzers); we ship both, and our cost numbers are token-exact against the reference implementation while T3 and CodexBar were shipping double-count fixes this very week.
3. **Deepest multi-account discovery**: `CLAUDE_CONFIG_DIR` profiles + per-profile keychain + `~/.codex*` homes — the exact gaps T3's launch repliers complained about ("only seeing the default Claude profile").
4. **The meter lives where agents launch.** Still true, and more defensible now: the market is 25-new-tools-a-month commoditized at "look at the number"; nothing else can route work based on it.
5. **Zero extra process/app** — vs a category whose #2 complaint is RAM/CPU bloat and whose current arms race is Keychain-prompt damage control.

### Messaging updates from this pass

- Keychain/credential safety is now an active battleground — explicitly say **"read-only tokens, no keychain writes, no new prompts."**
- T3's accuracy saga is our proof point: **"verified token-exact against ccusage"** is a checkable claim no one else makes.
- Don't claim "only multi-account" (tokenmaxx, AgentCodeGUI, runway, ai-usagebar all do it) — claim **deepest discovery + only one that can act on it**.
- SessionWatcher proves willingness-to-pay for meters; our "Cost to you: $0" framing lands harder against a paid competitor.

---

## 5. Failure modes & unmet needs (online research 2026-08-16)

Mined from GitHub issues of ccusage (~18k stars, org-migrated ryoppippi/ccusage → ccusage/ccusage), steipete/CodexBar (~3,000 issues), mryll/claudebar, mstallone/runway (zero issues ever filed — no data), plus anthropics/claude-code, openai/codex, Reddit/HN/X complaints. Ranked by how likely each bites Superset's Usage feature (OAuth quota fetch + transcript parsing + per-workspace attribution + desktop dashboard).

### 5a. Failure modes, ranked by likelihood of biting us

**1. Refreshing the CLI's OAuth token logs the user out of Claude Code.** The category's worst incident: CodexBar [#1161](https://github.com/steipete/CodexBar/issues/1161) — Anthropic refresh tokens are single-use rotating; CodexBar called the refresh endpoint directly, stored the new token in its own cache, and the CLI's stored refresh token became `invalid_grant` → users forced to `/login` daily. Fix was an architectural retreat (0.47.0 "Stop reading Claude-owned credentials"): refresh is delegated to the Claude CLI, direct reads are opt-in. ccusage's maintainer refuses to touch credentials at all ("too dangerous for us", [#610](https://github.com/ccusage/ccusage/issues/610)). Bonus horror: when quota drains for unrelated reasons, the tracker gets blamed first ([#2654](https://github.com/steipete/CodexBar/issues/2654), a false alarm).
   **Defense:** never call the OAuth refresh endpoint with a CLI-owned refresh token. Read access tokens read-only; if expired, either show stale-with-timestamp or delegate refresh to the owning CLI and re-read. Treat "we will never invalidate your login" as a testable invariant (integration test: token file bytes unchanged after our fetch path runs).

**2. 429 rate-limiting of the usage endpoint itself.** `/api/oauth/usage` hard-limits pollers: permanent 429 loops with `retry-after: 0` for statusline tools polling 30–60s ([claude-code #30930](https://github.com/anthropics/claude-code/issues/30930), [#31021](https://github.com/anthropics/claude-code/issues/31021), [#31637](https://github.com/anthropics/claude-code/issues/31637) — all closed "not planned"). One tracker author logged 111 consecutive 429s over 18h and pivoted to reading `rate_limits` pushed on statusline stdin ([post-mortem](https://nick-liu.com/posts/plan-usage-statusline-pivot/)). CodexBar: silent retry spam accumulated into a rate-limited bucket ([#575](https://github.com/steipete/CodexBar/issues/575)); even settings changes triggered refetch storms ([#1994](https://github.com/steipete/CodexBar/issues/1994)).
   **Defense:** poll ≥5 min with jitter, cache last-good response with fetch timestamp, honor Retry-After, exponential backoff with a hard ceiling, never refetch on UI-only events. We already have the "no unbounded auth retries" rule — apply it here verbatim. Consider harvesting Claude Code's own statusline `rate_limits` push as a zero-API-call source.

**3. Provider response-shape drift breaks the quota fetch.** Every plan launch or payload reshuffle broke CodexBar's strict decoders: unknown `plan_type: "prolite"` failed the whole fetch ([#709](https://github.com/steipete/CodexBar/issues/709)); Codex moved a 30-day window into the `primary` slot → "Session, resets in 24 days" ([#2592](https://github.com/steipete/CodexBar/issues/2592)); Team limits moved under `spend_control.individual_limit` ([#2736](https://github.com/steipete/CodexBar/issues/2736)); EDU limits live in a different endpoint entirely ([#2900](https://github.com/steipete/CodexBar/issues/2900)); Claude Enterprise responses have no session windows at all ([#925](https://github.com/steipete/CodexBar/issues/925)); tokens missing the `user:profile` scope can't fetch usage ([#62](https://github.com/steipete/CodexBar/issues/62)).
   **Defense:** lenient decoding — unknown enum values pass through as strings, missing fields render as absent (not error), map rate windows by duration not array position, degrade per-card instead of failing the whole fetch. Explicitly handle "this plan has no session window" (Enterprise/EDU/Team).

**4. Transcript JSONL token fields are unreliable — undercounting.** Claude Code writes early streaming snapshots and never finalizes them: ~75% of entries carry placeholder values (0/1 input tokens; output excludes thinking tokens) → up to 174x undercount vs Claude's own numbers ([ccusage #866](https://github.com/ccusage/ccusage/issues/866), [#916](https://github.com/ccusage/ccusage/issues/916): 22% real vs 6.9% estimated). Dedup semantics compound it: multiple lines share one `message.id:requestId`, first-write-wins kept the partial row → 2.7x output undercount ([#901](https://github.com/ccusage/ccusage/issues/901)); skipping dedup on one code path doubled counts ([#994](https://github.com/ccusage/ccusage/issues/994)).
   **Defense:** dedupe by `message.id:requestId` keeping the most-complete entry (max tokens), never `Set`-based first-wins. Label transcript-derived numbers as estimates everywhere; use the official quota fetch for anything limit-related. Never let two code paths (dashboard vs per-workspace) implement dedup separately.

**5. Codex cumulative counters + subagent replays — wild overcounting.** Codex `token_count` events are cumulative and re-emitted; counting each as new inflated usage 30–67% ([ccusage #1288](https://github.com/ccusage/ccusage/issues/1288)). Subagent `thread_spawn` sessions replay the parent's full history re-timestamped → 91x inflation ([#950](https://github.com/ccusage/ccusage/issues/950)), with a long tail of fork-replay siblings fixed over ~10 releases. CodexBar independently hit double-billed cached tokens (2.7–4.6x, [#1796](https://github.com/steipete/CodexBar/issues/1796)) and ignored-subagent undercount ([#2193](https://github.com/steipete/CodexBar/issues/2193)).
   **Defense:** delta cumulative counters per session id; detect replay bursts (identical token history re-emitted across a fork) and exclude; dedup keys must not include timestamps. This bites per-workspace attribution hardest — Superset runs many parallel/subagent sessions by design.

**6. Big-log performance and OOM.** ccusage: whole-file reads of 0.5–1.1GB JSONL exceeded V8's max string length ([#873](https://github.com/ccusage/ccusage/issues/873)); the Codex scanner took minutes and 30GB RAM ([#885](https://github.com/ccusage/ccusage/issues/885)); worse, oversized files were *silently skipped* so historical days vanished ([#952](https://github.com/ccusage/ccusage/issues/952); CodexBar's 256MiB budget did the same, [#2823](https://github.com/steipete/CodexBar/issues/2823)). CodexBar's process hit 7GiB ([#2637](https://github.com/steipete/CodexBar/issues/2637)); its top-👍 issue ever is "becoming bloated" ([#1364](https://github.com/steipete/CodexBar/issues/1364), 38👍); a churned user filed "Too many production issues — leaving this app" ([#2732](https://github.com/steipete/CodexBar/issues/2732)). ccusage re-parsing everything per run (17–20s) meant people "basically never check" ([HN](https://news.ycombinator.com/item?id=47262484)).
   **Defense:** stream line-by-line (never `readFile` whole), incremental scans keyed by file mtime/size cursor persisted in SQLite (CodexBar's eventual fix, [#2760](https://github.com/steipete/CodexBar/issues/2760)), scan off the main process, and if a file must be skipped, surface it in the UI — silent data loss is worse than slow.

**7. Pricing/cost drift.** New model missing from the bundled pricing table → $0.00 silently ([ccusage #844](https://github.com/ccusage/ccusage/issues/844)); fuzzy substring matching priced `gpt-5.4-mini` as `gpt-5` (5x, [#934](https://github.com/ccusage/ccusage/issues/934)); cache-writes priced at the 5-min tier when Claude Code uses 1-hour (60% underestimate, [#899](https://github.com/ccusage/ccusage/issues/899)); pricing fetch failed under TLS interception and silently used the stale snapshot ([#1439](https://github.com/ccusage/ccusage/issues/1439)); no historical pricing at all ([#764](https://github.com/ccusage/ccusage/issues/764)). CodexBar showed $3,000/mo for $7 real ([#321](https://github.com/steipete/CodexBar/issues/321)) and treated cents as dollars ignoring currency ([#97](https://github.com/steipete/CodexBar/issues/97)). Subscription users find invented dollar figures scary/meaningless ([ccusage #1280](https://github.com/ccusage/ccusage/issues/1280)); Theo's "$1,100 of inference on a $200 sub" became a community joke about API-price math on subscription quota.
   **Defense:** exact-match model pricing with a visible "unknown model — cost not estimated" state (never $0); split cache-write tiers; for subscription accounts lead with quota %, demote dollars to a clearly-labeled "API-equivalent estimate."

**8. Timezone / day-boundary / reset-time bugs.** UTC day-grouping put evening usage on tomorrow ([ccusage #349](https://github.com/ccusage/ccusage/issues/349)); statusline "today" showed $0.00 ([#778](https://github.com/ccusage/ccusage/issues/778)); `--since` date parsing used `replace('-','')` (first dash only) making filters silent no-ops ([#1483](https://github.com/ccusage/ccusage/issues/1483)). CodexBar: pace projection mistaken for reset time ([#960](https://github.com/steipete/CodexBar/issues/960)); reset parsed from server HTML that's always UTC → off by the viewer's UTC offset ([#1826](https://github.com/steipete/CodexBar/issues/1826)); stale-quota deadlock after an early weekly reset ([#2790](https://github.com/steipete/CodexBar/issues/2790)). claudebar: float `13.0` + comma-decimal locale broke bash printf ([mryll/claudebar #4](https://github.com/mryll/claudebar/issues/4)).
   **Defense:** group by local day, compute from epoch timestamps only, take reset times verbatim from API epochs, label "projected empty" distinctly from "resets at," locale-proof number formatting.

**9. Multi-account / profile confusion.** CodexBar silently reverted to the old account ~2h after a switch (stale credential cache retained refresh ownership, [#2689](https://github.com/steipete/CodexBar/issues/2689)); usage history stayed pinned to the previous account ([#1785](https://github.com/steipete/CodexBar/issues/1785)); account-switcher tools broke it ([#2731](https://github.com/steipete/CodexBar/issues/2731)). Theo's repliers within hours: "only seeing the default Claude profile, not my 2 custom profiles"; ccusage's `CLAUDE_CONFIG_DIR` *replaces* rather than appends dirs ([#1505](https://github.com/ccusage/ccusage/issues/1505)).
   **Defense:** key usage and quota by account identity extracted from the token/response, not by file path; enumerate all `CLAUDE_CONFIG_DIR` profiles and `~/.codex` logins; invalidate caches on account switch. We already do multi-account — the trap is stale caches winning after a switch.

**10. macOS Keychain prompt storms.** CodexBar's single biggest complaint class ([#340](https://github.com/steipete/CodexBar/issues/340), [#108](https://github.com/steipete/CodexBar/issues/108), [#2115](https://github.com/steipete/CodexBar/issues/2115); 35/35/30 👍): delete+recreate of keychain items wiped ACLs, Claude Code's own refresh rewrites its credentials item invalidating fingerprints, "Always Allow" never stuck. Repeatedly fixed, repeatedly regressed; only fully resolved by not reading foreign keychain items at all.
   **Defense:** if we read Claude's keychain credentials, read-only and expect the item to be rewritten under us at any time; never delete/recreate; degrade to "re-auth needed" UI instead of re-prompting loops.

**Honorable mentions:** the tracker itself burning quota — CodexBar's auto-fallback spawned `codex app-server` every 5 min, ~3M tokens/probe ([#874](https://github.com/steipete/CodexBar/issues/874)); never shell out to agent CLIs on a poll loop. Per-workspace attribution via encoded directory names — Windows drive letters collapsed project names to "C" ([ccusage #818](https://github.com/ccusage/ccusage/issues/818)), dash-prefixed dirs matched every session ([#560](https://github.com/ccusage/ccusage/issues/560)); attribute by the `cwd` field inside JSONL entries, not by decoding `~/.claude/projects` folder names. Schema drift is perpetual: `costUSD` removed in CC 1.0.9 ([ccusage #4](https://github.com/ccusage/ccusage/issues/4)), Codex pre/post-0.44 formats need separate parsers ([openai/codex #20952](https://github.com/openai/codex/issues/20952) asks for stability guarantees; unanswered).

### 5b. Top unmet needs (what users keep asking for that nobody ships)

1. **Numbers that match what the provider enforces.** The #1 credibility complaint everywhere: local-log estimates can't match server-side quota (cross-device usage invisible, cost-based limits vs token math, placeholder JSONL values). ccusage deprecated its live-blocks gauge over it ([#676](https://github.com/ccusage/ccusage/issues/676)); Claude-Code-Usage-Monitor got called out for hardcoded guessed limits ([#165](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/165)). We fetch official quota — lead with it, and label every estimate as one.
2. **Multi-account with headroom-aware switching.** CodexBar's canonical open tracker ([#1843](https://github.com/steipete/CodexBar/issues/1843), rolled up from #81 at 28👍) plus open ask to auto-switch Codex accounts on depletion ([#2851](https://github.com/steipete/CodexBar/issues/2851)). Nobody acts on the number; an orchestrator can route work to the account with runway.
3. **Cross-machine/device aggregation.** ccusage's #2 request ever ([#222](https://github.com/ccusage/ccusage/issues/222), declined over log privacy; sync daemon [#287](https://github.com/ccusage/ccusage/issues/287) same fate); T3 Code's whole launch pitch was "all your machines." Superset's host model is uniquely positioned.
4. **Speed as a feature.** CodexBar's all-time top issue is bloat ([#1364](https://github.com/steipete/CodexBar/issues/1364), 38👍); ccusage's 17–20s scans spawned a cottage industry of Rust rewrites. Incremental indexed scans, near-zero RAM, no per-render lag.
5. **Actionable auth/limit states + proactive warnings.** "Temporarily unavailable" instead of "run codex login" ([CodexBar #1170](https://github.com/steipete/CodexBar/issues/1170)); no guidance on 429 ([#575](https://github.com/steipete/CodexBar/issues/575)); open ask for credential-expiry notification before failure ([#2512](https://github.com/steipete/CodexBar/issues/2512)). Also: agent-readable quota (CodexBar `serve` spawned ~10 community ports) and reset-aware scheduling ("start the long job after reset") — both orchestrator-shaped, both unshipped by everyone.
