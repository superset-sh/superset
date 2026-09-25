# Token-spend tracking — Twitter feedback analysis

Source: [@FlyaKiet poll tweet, 2026-08-14](https://x.com/FlyaKiet/status/2088706419357012478) — "How useful would it be to track token spend in @superset_sh...? Is this a real problem for you?" (11 likes, 1 RT, 17 distinct respondents)

## TL;DR

Sentiment is clearly **in favor** (12 positive, 3 nuanced, 2 negative), but with a twist: the most substantive replies say **quota/limit % (5h session + weekly reset) matters more than raw token counts**. Raw token spend is largely a vanity/brag metric ("burned billions of tokens") plus a "look how much I'm saving vs API pricing" feel-good number. The strongest demand signals: one user already **forked Superset to add it**, and others run CodexBar / `/usage` daily to fill the gap.

## Sentiment breakdown

| # | User | Reply (condensed) | Sentiment | Link |
|---|------|-------------------|-----------|------|
| 1 | @baanditeagle | Neither OpenAI nor Anthropic show token burn on subs; people want to see savings vs direct API; "feels good to burn billions of tokens." Cites T3 Code: "People like it in t3 code — they will like it on superset." Attached a screenshot. | ✅ Strong yes | [1](https://x.com/baanditeagle/status/2088713402323775655) [2](https://x.com/baanditeagle/status/2088715352264048665) [3](https://x.com/baanditeagle/status/2088722635949838520) |
| 2 | @joaobnobre | "I actually forked Superset to add this, but based my fork on the Omarchy one." | ✅ Strong yes (built it) | [link](https://x.com/joaobnobre/status/2088824552339947557) |
| 3 | @0xmapachex | "100%" — Superset users are customization-obsessed, run `/usage` several times a day; a UI option "like there was for the ram before" would be amazing. Also flags multi-account management pain (built `@0xmapache/claude-profile` for it). | ✅ Strong yes | [1](https://x.com/0xmapachex/status/2088738027082228132) [2](https://x.com/0xmapachex/status/2088738175296434231) |
| 4 | @abhiaiyer | "You do [need it], people want to know it both for vanity and understanding." Also endorsed the plugin idea ("Solid take"). | ✅ Yes | [link](https://x.com/abhiaiyer/status/2088740477088813521) |
| 5 | @garyfung | Yes — but quota limit % used before 5h/weekly resets is even more important. | ✅ Yes, quota first | [link](https://x.com/garyfung/status/2088716068378620270) |
| 6 | @jakemintz | Sets price limits on hill climbs; "the models don't have great awareness of what they are spending." Wants budgets/caps, not just display. | ✅ Yes (budget angle) | [link](https://x.com/jakemintz/status/2088826181378588768) |
| 7 | @Ishaanbansal77 | "Would be awesome to track token spend by session and correlate with PRs." | ✅ Yes (analytics angle) | [link](https://x.com/Ishaanbansal77/status/2088718075508240843) |
| 8 | @jaseemts | "I use codexbar to track it now" (linked codexbar.app). | ✅ Yes (uses workaround) | [link](https://x.com/jaseemts/status/2088746557189574674) |
| 9 | @mobrk_ai | "Even if it isn't useful, it's something developers brag about 🤣" | ✅ Yes (vanity) | [link](https://x.com/mobrk_ai/status/2088719652335518075) |
| 10 | @TheShaanShaan | Fine "if it can be an optional checkbox to enable." | ✅ Yes, opt-in | [link](https://x.com/TheShaanShaan/status/2088787793476800542) |
| 11 | @diegolmello | "A nice to have." | ✅ Mild yes | [link](https://x.com/diegolmello/status/2088780048467648906) |
| 12 | @kushbhuwalka | "It's a novelty for me." | ✅ Mild yes | [link](https://x.com/kushbhuwalka/status/2088732623837503878) |
| 13 | @ruan_exclusive | "Quota usage is more useful" (than token spend). | ⚖️ Nuanced — quota > tokens | [link](https://x.com/ruan_exclusive/status/2088782375505273272) |
| 14 | @0xKoller | "Would prefer usage" (usage/quota display over spend). | ⚖️ Nuanced — quota > tokens | [link](https://x.com/0xKoller/status/2088715646364201085) |
| 15 | @dodeja | "Plugins — let people add this if they want. Make your UI composable." | ⚖️ Alternative — ship as plugin | [link](https://x.com/dodeja/status/2088730464190361878) |
| 16 | @mlpierce22 | "No. Don't all the CLIs do that for you anyway?" | ❌ No | [link](https://x.com/mlpierce22/status/2088773571837628791) |
| 17 | @Roy__Gross | "Non-solo devs don't care about token spend — they all use the company's subscriptions/tokens." | ❌ No (for teams) | [link](https://x.com/Roy__Gross/status/2088718174225084772) |
| — | @M1Heng | "When mobile?" (off-topic; Kiet replied: in TestFlight, submitted to App Store). | ➖ Off-topic | [link](https://x.com/M1Heng/status/2088866277662343238) |

**Tally: 12 positive · 3 nuanced/alternative · 2 negative · 1 off-topic**

## Key themes

1. **Quota % beats raw tokens.** The sharpest recurring point (garyfung, ruan_exclusive, 0xKoller, plus everyone using CodexBar-style tools): what users actually check is *% of 5h-session and weekly rate limit consumed, and when it resets*. Raw token counts are secondary. Kiet acknowledged this in-thread ("makes a lot of sense, thank you").
2. **Token spend is a vanity + savings metric.** "Burned billions of tokens," "how much am I saving vs direct API" (baanditeagle, mobrk_ai, abhiaiyer). Real emotional pull even if low utility — providers hide this on subscription plans, which is exactly why third-party tools exist.
3. **Per-session/per-PR attribution and budgets.** Track spend by session and correlate with PRs (Ishaanbansal77); set price limits on long agent runs because "models don't have great awareness of what they're spending" (jakemintz). This is the angle competitors don't do well and fits Superset's multi-agent orchestration story.
4. **Make it optional / composable.** Opt-in checkbox (TheShaanShaan); ship as a plugin so the UI stays composable (dodeja, +1 from abhiaiyer). Ties directly into the plugin-system surface research already underway.
5. **Segment matters.** Solo devs on personal subs care; devs on company subscriptions don't (Roy__Gross). Vanity/quota framing targets prosumers.
6. **Adjacent pain: multiple accounts.** 0xmapachex juggles multiple Claude accounts and built a CLI for switching; quota display per account would compound the value.

## Examples cited in the thread (prior art)

- **T3 Code usage page** (the "t3" reference) — Theo's open-source coding-agent GUI shipped a [usage page breaking down API costs and token usage across Claude Code and Codex](https://x.com/theo/status/2086053137115406588), reading actual Claude/Codex local history from all your machines, not just T3-initiated usage. Repo/product: [t3.codes](https://t3.codes/). This is what baanditeagle's screenshot showed and the direct "people like it there" comp.
- **CodexBar** (jaseemts' daily driver) — [steipete/CodexBar](https://github.com/steipete/CodexBar), MIT, Swift macOS menu-bar app: session + weekly quota %, reset timers, credits for ~29 providers (Claude Code, Codex, Cursor, Copilot, Gemini…), no login required, bundled CLI. Site: [codexbar.app](https://codexbar.app/). Note it leads with *limits and reset timers*, not raw tokens — evidence for theme 1.
- **The "Omarchy one"** (basis of joaobnobre's Superset fork) — the Omarchy/Waybar widget ecosystem for AI usage: [mryll/claudebar](https://github.com/mryll/claudebar) (pure-Bash Waybar widget: session/weekly/per-model limits, progress bars, countdowns, pacing, Omarchy theming), [rodrigo-sntg/omarchy-ai-usage](https://github.com/rodrigo-sntg/omarchy-ai-usage) (Claude + Codex rate limits in Waybar), and [akitaonrails/ai-usagebar](https://github.com/akitaonrails/ai-usagebar) (Rust port, multi-provider, TUI mode).
- **@0xmapache/claude-profile** (0xmapachex's own tool) — [npm package](https://www.npmjs.com/package/@0xmapache/claude-profile) for managing/switching multiple Claude accounts; cited as the adjacent multi-account pain.
- **Claude Code `/usage`** — the in-CLI command users trigger "a few times a day"; the friction of doing that manually across many parallel agents is the gap Superset could close (mlpierce22's "don't the CLIs do that?" is answered by: yes, but one terminal at a time).

## Takeaway

If built, lead with **quota/limit % + reset countdown per account (and surfaced across all running agents)**, with cumulative token/cost stats as the fun secondary layer, opt-in or plugin-shaped, with per-session/per-PR attribution and optional budget caps as the differentiator no menu-bar tool can do.

---

# Follow-up research: best existing solution for quota-limit % (2026-08-16)

## New feedback (Slack, Matt)

Matt uses [mstallone/runway](https://github.com/mstallone/runway) ([runway.page](https://runway.page/)) "because I can visually see all my subscription usages in my menu bar, and I can **choose whatever subscription has the highest remaining quota when starting a new task in Superset**." Key points:

- Doesn't need a full token tracker — runway is "the best solution there is for **multiple accounts**."
- Concrete product ask: "**just implement a quota used in the model dropdown**, and that would be adequate for my use case."
- Still likes the vanity layer ("bragging rights with how many tokens I use as a tokenmaxxer").
- Posted on Slack, not Twitter, because he doesn't want to get banned for **OpenAI ToS violations** — i.e. these trackers hit undocumented ChatGPT backend endpoints and users know it's gray.

This confirms both top themes from the Twitter thread: quota % > raw tokens, and multi-account quota arbitrage is the real workflow (same as @0xmapachex).

## Tool comparison

| Tool | Platform | Multi-account | What it shows | License |
|------|----------|---------------|---------------|---------|
| **[runway](https://github.com/mstallone/runway)** (mstallone) | macOS 15+ menu bar + iOS companion | ✅ **Auto-detects multiple accounts per provider** (Keychain + `~/.claude/.credentials.json` + Claude Desktop cache + `CLAUDE_CONFIG_DIR` profiles + env token); one card per account with email/org | Session + weekly + per-model quota %, reset countdowns, **pace indicators**, Today/Yesterday/30d spend priced from local logs; pin up to 2 metrics per provider to menu bar; 12 providers | MIT |
| **[CodexBar](https://github.com/steipete/CodexBar)** (steipete) | macOS 14+ menu bar + bundled CLI (Linux-capable) | ❌ single account per provider | Session/weekly quota %, resets, credits for ~29 providers; most mature, 3-tier fallback (OAuth → web cookie → CLI PTY) | MIT |
| **[claudebar](https://github.com/mryll/claudebar)** (mryll) | Linux Waybar (the "Omarchy one") | ❌ | Session/weekly/per-model %, countdowns, pacing; pure Bash — doubles as a reference implementation | MIT |
| **T3 Code usage page** | in-app | n/a | Token/cost history from local Claude/Codex JSONL — the vanity layer, **not** quota % | open source |
| Claude Code `/usage`, `codex /status` | in-CLI | per-login only | The official numbers, one terminal at a time | — |

**Verdict: runway is the best existing solution for Matt's use case** — it's the only one doing multiple accounts per provider, and its quota-arbitrage workflow ("start the next task on the sub with the most headroom") is exactly the Superset-shaped problem. CodexBar is the more battle-tested single-account option with the widest provider list. Neither closes the loop: you still read a menu bar, then manually pick the account in another app.

## How they all get quota % (same two undocumented endpoints)

- **Claude:** `GET https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth bearer token (Keychain `Claude Code-credentials` / `~/.claude/.credentials.json`; needs `user:profile` scope). Returns `five_hour` + `seven_day` utilization, per-model weekly windows, reset timestamps, plan tier. claudebar's Bash source is a complete recipe.
- **Codex:** `GET https://chatgpt.com/backend-api/wham/usage` with the token from `~/.codex/auth.json`. Returns 5h/weekly rate-limit windows, resets, credits. Lower-risk alternative: `codex app-server` JSON-RPC reports the same usage windows through the official CLI (CodexBar's fallback #1).
- Fallback of last resort: PTY-scrape `claude /usage` / `codex /status`.
- Implementation hazards documented by runway/CodexBar: (1) **token-refresh races** — a second app refreshing the OAuth token can trip server-side token-reuse protection and log out the CLI; runway only renews when it can write the result back to the same store; (2) education/org-managed Claude subs return no numeric quota fields; (3) endpoints are undocumented and can change or be gated any time.

## ToS / risk analysis (Matt's ban worry)

- **Anthropic** [banned subscription OAuth for third-party products on 2026-02-20](https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use) — aimed at third-party **inference** through sub tokens (OpenClaw, OpenCode). Whether read-only usage polling is covered is unstated; it's gray.
- **OpenAI** doesn't explicitly prohibit third-party OAuth reads, but `backend-api/wham/*` is undocumented, and unexplained Codex account bans are [documented in the community](https://community.openai.com/t/codex-chatgpt-pro-account-banned-with-no-warning-no-explanation-18-month-subscriber/1381906). Matt self-censoring on Twitter is the signal: users perceive real risk.
- **De-risked path for Superset:** get the numbers **through the official CLIs Superset already runs** — `codex app-server` RPC for Codex, and for Claude prefer parsing the CLI (`claude /usage`) or its already-refreshed local token *read-only, never refreshing it ourselves*. Superset never touches provider backends with its own client; the user's own CLI session stays the only authenticated actor. Worst case, an optional integration can read runway's local HTTP API (`127.0.0.1:6736/v1/limits`) when the user already runs it.

## Implementation status (2026-08-16)

**Shipped on this branch** (CDP-verified in the dev app):
- Host-service `usage.quota` tRPC query — `packages/host-service/src/trpc/router/usage/` (claude.ts, codex.ts, usage.ts, types.ts). Discovers Claude logins (config files + `CLAUDE_CONFIG_DIR` profile + macOS Keychain, deduped by token) and the Codex `$CODEX_HOME/auth.json` login; fetches both quota endpoints; 60s shared-promise cache; tokens strictly read-only (`token_expired` status instead of refreshing). Field gotchas encoded: Codex `reset_at` epoch-seconds vs Claude `resets_at` ISO.
- Desktop **Usage tab**: top-level dashboard nav entry (gauge icon, next to Workspaces/Automations/Tasks/Pull requests, both expanded and collapsed rail) → `/usage` route at `routes/_authenticated/_dashboard/usage/` (page + `UsageView` + `useHostUsageQuota` hook against the local host's client; per-user request it moved here from the initial workspace "+" pane placement). Gemini-style meters per the Mobbin research: label + "N% used", thin full-width bar (neutral <70 / amber ≥70 / red ≥90), "Resets in 5d 13h · Aug 21" caption, provider-grouped account cards with plan badge + source, credits line, "Updated just now" stamp, 60s refetch.

**Marketing research** (2026-08-16): `plans/20260816-quota-tools-marketing-research.md` — cloned repos + docs mining + HN/Reddit/X sentiment. Headlines: CodexBar (20.1k★) + ccusage (18k★) dominate; ranked love themes = savings-vs-API vanity, limit-anxiety relief mid-session, glanceability, multi-account juggling, cross-machine aggregation. Accuracy is existential (Theo's launch got "is this actually correct?" as the top reply — JSONL estimates double-count; we read the official quota endpoint the CLI enforces). Theo publicly declined multi-account — our opening: an orchestrator can *act* on headroom ("start the agent on the account with the most quota"), no menu bar can. Avoid leaderboard/flexing framing (community fears it invites tighter limits).

## Prior art inside our own repo + T3 graphics (research 2026-08-16)

- **PR #5798** (IkramBagban, "Token Usage screen", never human-reviewed, rotted on main): lift `window-pace.ts` (pure 47-line pace formula: `projectedUsedAtReset = usedPct/elapsedFraction`, `reservePct`), `log-files.ts` walker, cost-aggregator shape (local-midnight buckets, `approximate` flag), reserve-tick meter detail, tray/`worstWindowAcrossProviders` idea. Skip: its `/v1/messages` probe (burns a real request per poll — 288/day), Electron-main placement, pricing values (Fable 5 priced 2x wrong, no gpt-5), Claude parser without message-id dedupe (systematic over-count on resume/subagents).
- **alchemistchaos/feat/minimal-ai-usage-meter** (compact-meter prototype): sidebar-footer mount proven (tab-bar variant added then reverted), `usageIndicatorPolicy.ts` pure+tested summary logic, `AccountUsageBlock` accessible bar row, settings-toggle pattern (constants default + tRPC pair + settings-search registration), popover-open-gated fetching, `codex app-server --stdio` JSON-RPC reader (our de-risked Codex path). Skip: Electron-main data layer (duplicates our host-service router, local-only), `codex-profiles.ts` auth.json swapping, stale migration 0046, unregistered localStorage key.
- **T3 Code usage page** (pingdotgg/t3code, hand-rolled SVG): layered-from-zero (NOT stacked) monotone-cubic areas per provider ("stacked reads as 'that one is bigger'"); COST|TOKENS toggle driving headline + chart; 24h/7d/30d/90d ranges (24h = hourly); 5 hairline metric tiles incl. **cache savings $** ("3.4x the raw token cost"); model/day breakdown tables; cross-machine merge with `device:inode` source fingerprints; `costSource: providerReported|modelPriced|unpriced` honesty labels; static skeleton until all devices report. Notably ABSENT: quota %/resets (our lead), per-project attribution (our edge — `~/.claude/projects/<encoded-cwd>` is already the project key), burn rate.
- **ccusage**: 5h `blocks` view = signature (Active/Gap status, `Rate: 2.1k/min`, `Projected`, `--token-limit max` progress bars). **CodexBar**: the only one charting **used-% per quota window over time** (30 bars vs full-height track, reset-boundary aligned).
- Load-bearing parser gotchas: reasoning tokens are a SUBSET of output; cached+cacheCreation+uncached sum to input; bucket in user TZ not UTC; dedupe Claude messages by message.id+requestId and skip isSidechain; Codex reads `info.last_token_usage` deltas (not cumulative `total_token_usage`); aggregate host-side, ship buckets not records.

**History dashboard shipped (2026-08-16, same branch):** host-service `usage.history` — worker-pool task (`workers/tasks/usage.ts`, registered in host-worker.ts; 5GB of transcripts scanned in ~4.6s off-loop) walking `~/.claude/projects` + `$CODEX_HOME/sessions` with the correctness rules from the research (Claude: assistant-lines only, message.id+requestId dedupe, per-tier 5m/1h cache-write pricing from `cache_creation`; Codex: `last_token_usage` deltas, `turn_context` model/cwd carry-forward, cached-inclusive input split; reasoning = subset of output; local-midnight day buckets aligned to the range). Pricing table verified 08-16 (Fable 5 $10/$50 — PR #5798 had it 2x wrong; gpt-5.6-sol $5/$30, gpt-5.3-codex $1.75/$14; cache read 0.1x, write 1.25x/2x). Renderer: T3-informed layout — headline $ with "* if billed at full API rate", provider share rows, **layered (not stacked) monotone area chart** (palette #d06a48/#1596d6 validated with the dataviz checker both modes), Cost|Tokens + 7d/30d/90d toggles, five hairline metric tiles (incl. cache-savings $ — "5.5x the raw token cost"), model table, per-project bars (our unique attribution). Real-data verify: $19.2k/30d, 13.9B tokens, 96% cached input, $105k cache savings. Demo film: /tmp/usage-dashboard-demo.mp4.

**Accuracy verification (2026-08-16):** per-model Aug-15 comparison vs ccusage v20 matches **token-exact and cent-exact** (fable $995.84 / output 1,532,722 / cacheRead 663,336,918 identical) after two parser fixes found by the audit: (1) Claude dedupe must keep the **last** occurrence per message.id+requestId (usage snapshots grow per content-block line; first-wins undercounted output ~10%); (2) Codex re-emits identical `token_count` events back-to-back — consecutive-duplicate suppression brings delta sums within ~1% of Codex's own cumulative `total_token_usage` counters (self-check: 136 sessions). Note ccusage v20 counts Codex too, but its Codex cache-read numbers look wrong (415K/day vs our ~66M/day from the logs' own counters) — don't use it as the Codex oracle. Corrected 30d totals: $19,497 / 14.01B tokens. History also now scans all Claude homes (~/.claude, ~/.config/claude, CLAUDE_CONFIG_DIR comma-list) with cross-profile dedupe.

**Multi-account status (SHIPPED 2026-08-16):** runway-style auto-discovery implemented in `usage/profiles.ts` — scans dot-dirs at `~` + dirs under `~/.config` (1.5s budget); a Claude candidate counts only when its own `.claude.json` names an oauthAccount (identity-extraction-is-validation, and it gives us the email for free — shown even when the token is expired); credentials from the dir's `.credentials.json` or its per-profile Keychain item `Claude Code-credentials-<sha256(literal)[0:8]>` probed across 4 path spellings. Codex: `~/.codex*` dot-dirs with a token-bearing auth.json, accounts deduped by email. Both quota AND history consume the discovery (each profile's `projects/` is scanned; cross-profile message dedupe). E2E-verified with a synthetic `~/.claude-testprofile`: profile discovered, second quota card rendered with profile email, history priced its transcript exactly ($1.026 hand-calc = $1.03). Remaining hard limit: per-ACCOUNT history attribution is only possible per-profile-dir — transcripts don't record the account.

**Next steps** (from the research, not yet built): compact 40–56px meter next to each account in the model/agent dropdown showing the more-constrained window (Braintrust/Railway pattern), pace indicator, per-session/per-PR token attribution, budget caps, token/cost history layer (local JSONL, T3-style). UI reference corpus: `plans/20260816-quota-ui-mobbin-research.md` (screenshots stay in /tmp — Mobbin content is internal-use-only).

## Recommended shape for Superset

1. **Quota % in the model/account dropdown** (Matt's exact ask): when starting a task, each account row shows `▓▓▓░ 62% · resets 3:10pm` for the 5h window (weekly on hover). Superset already knows which credentials each host/agent uses — this closes the loop runway can't: pick-highest-headroom happens *where the task starts*, or is even auto-suggested.
2. Per-account quota via CLI-mediated fetch (above), cached ~60s, multi-account via `CLAUDE_CONFIG_DIR`-style profile detection (runway's model).
3. Token/cost "tokenmaxxer" stats as the secondary vanity layer (T3-Code-style, from local JSONL logs — zero ToS exposure, purely local files).
4. Opt-in, per the thread; plugin-shaped if the palette/plugin surface lands first.
