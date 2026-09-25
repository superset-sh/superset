# Mobbin research: usage/quota UI patterns for the Superset "Usage" tab

Researched 2026-08-16 via Mobbin (signed-in Comet session, CDP-driven). Method: Mobbin
text-in-screenshot search ("usage limits", "usage this month", "credits used", "plan usage",
"rate limit", "usage resets", "included usage", "resets at", ...), then screenshot of each
candidate screen's detail page. All files below live in /tmp/mobbin-quota-research/.

Not indexed on Mobbin (checked): Claude's own usage-settings screen, OpenRouter, T3 Chat.
Vercel is indexed but its dedicated usage dashboard didn't surface (only a Pro Trial modal).
No WebSearch fallback was needed - coverage from the 10 references below is strong.

---

## 1. Top reference patterns

### A. Google Gemini - "Usage limits" settings page (gemini-weekly.png) - THE closest analog
Mobbin: /screens/1cb3c785-d4df-4a3a-992d-e887d1129667
- Two stacked rows inside flat gray cards: "Current usage - 6% used" and "Weekly limit - 5% used".
- Percent right-aligned as plain text; under the row title a thin (~6px) fully-rounded bar,
  dark fill on light track, no color coding at low usage.
- Reset info is a small gray caption directly under the bar: "Resets at 3:22 PM" (session)
  and "Resets Jun 15 at 1:22 PM" (weekly) - time-of-day for the short window, date+time for weekly.
- "Updated just now" freshness stamp above the cards; upgrade card ("Get 5x more usage with
  AI Ultra") sits below as a quiet row, not interleaved with the meters.
- Why it's good: exactly our dual-window model (short session window + weekly window);
  proves %-used + reset-caption is enough - no token counts on the primary surface.

### B. GitHub - "Usage this month" on Plans & usage (github-1.png)
Mobbin: /screens/1423868a-cc2d-434e-a1bd-a9f9bfccb6be
- Per-product groups (Actions, Packages) each in a bordered card with an icon header;
  the reset countdown lives in the group header as prose: "Included minutes quota resets in 29 days".
- Metric rows: label + "0.00 of 2,000.00 min included" with a thin progress bar under the
  numbers, right column shows $ overage; separate "monthly spending limit | Set up a spending limit" row.
- Also on this screen: "In addition to your personal account, you have 2 organization accounts"
  with a manage dropdown - the closest multi-account affordance found.
- Why it's good: grouping + per-group reset text + "X of Y included" phrasing; spending limit
  as a sibling row, not buried in another page.

### C. Google AI Studio - "Gemini API Rate Limit" table (aistudio.png)
Mobbin: /screens/0e18ec73-ca54-4674-b255-a1be428d78d5
- Full-width table: Model | Category | RPM | TPM | RPD - three quota dimensions per row.
- Each cell = tiny (~60px) horizontal micro-bar + "0 / 30" text to its right; "-" when a
  dimension doesn't apply. Header states scope: "Peak usage per model compared to its limit
  over the last 28 days"; free-tier badge next to the page title; Project + Time Range dropdowns.
- Why it's good: best per-model-limits pattern seen - micro-bar + used/limit text is legible
  at very small sizes and scales to many models; exactly what our per-model section needs.

### D. Cursor - dashboard Usage page (cursor-usage-1.png, cursor-usage-2.png)
Mobbin: /screens/1032f580-..., /screens/29df90a9-...
- "Included Usage" table (usage-2): Item | Tokens | Usage % with bold parent rollup rows
  ("API - 20.3M tokens - 11.5%") and indented per-model child rows ("gpt-5.3-codex-high -
  6.3M - 9.9%"). Billing-period dates directly under the section title.
- "On-Demand Usage" section: big "$0.00 / $1.00" (spent slash limit, muted denominator) + cycle picker.
- "Included Usage Summary" (usage-1): per-model token accounting table (input w/ and w/o cache
  write, cache read, output, total tokens, API cost, cost to you) + period picker (1d/7d/30d)
  + "All Raw Events" feed below.
- Why it's good: canonical deep/secondary layer - rollup-%-first, token detail second, raw
  events last; "cost to you: $0" is a nice trust touch for subscription quota vs API cost.

### E. Railway - Usage page + header pill (railway.png)
Mobbin: /screens/ba45644f-9b71-40cf-a958-a307056b53b1
- Top-right persistent pill: "24 days or $4.89 left" - whichever of time/budget runs out
  first, in one compact amber-tinted chip. Best "pinned scarce-resource" pattern found.
- Summary block: ledger-style rows (Current Usage / Discounts / Credits Used / Estimated
  Month's Cost) beside two stat tiles ("Credits Available $5.00", "Est Credits Required" in green).
- "Usage by Project" breakdown rows with current + estimated cost, expandable.
- Why it's good: the pill compresses quota state to one glance; estimate-vs-available pairing
  is a ready-made pace indicator.

### F. Emergent - "Credit Usage" settings modal (emergent.png)
Mobbin: /screens/12e3dcf2-fb55-4113-9b86-9aa2f1202581
- "Available credits" strip: big total (37.71) + three labeled buckets with info tooltips:
  "Plan credits 38.45/100 - Top-up credits 0 - Free credits 0/10" - multiple quota pools
  side by side (analog to multiple accounts/pools per provider).
- "Usage history" below: filter dropdowns (Last week / All projects / All types), then
  day-grouped ledger: date header shows "Credits used 0.77 | Balance 37.71", rows are
  events ("Agent Call | 1 active jobs - -0.77") with per-event debits.
- Why it's good: cleanest credits-history ledger seen; running balance per day is a great
  model for our token/cost history layer.

### G. Braintrust - sidebar-bottom "Free plan usage" block (braintrust.png)
Mobbin: /screens/0090c0c7-55ee-4baa-a127-448848c2efee
- Pinned at the bottom of the app sidebar: tiny card titled "Free plan usage" with an
  open-in-new arrow; two rows: "Logs - 0.0043 of 1 GB - [tiny bar]", "Scores/metrics -
  0 of 10,000 - [tiny bar]". Bars are ~40px wide, right-aligned, gray.
- Why it's good: THE compact-meter reference for our model-picker dropdown - label + "x of y"
  + micro-bar fits in a 20px row and stays readable.

### H. Lovable - "Cloud & AI balance" dialog (lovable-1.png)
Mobbin: /screens/08084aa7-cc55-4bb2-8c31-38e8cfcfe95c
- Left summary card: product logo + "Monthly included usage resets 1 Jan 2026" + top-up
  balance + "Top up" button. Right card: two rows, "Cloud - $0 / $25 free balance used"
  and "AI - $0 / $1", each with a separate "Top-ups used" column.
- "Project breakdown" collapsible table: Project | AI usage | Cloud usage.
- Why it's good: two resource meters + reset date + per-consumer breakdown in one dialog;
  slash notation "$0 / $25" with muted denominator recurs across Cursor/Lovable - adopt it.

### I. Perplexity - in-context "Usage" side panel (perplexity.png)
Mobbin: /screens/1fc1aaf8-03b9-409a-b033-f4fb1051cade
- Collapsible "Usage" section in the right rail of a running task: "Credits used 40.82",
  "Worked for 1m 6s", then a 2x2 grid of micro-tiles (Text 40.82 / Image 0 / Video 0 /
  Audio 0, each "credits used" with a corner icon), and a "Manage credits and usage" button.
- Why it's good: usage embedded next to the work itself; micro-tile grid is an option for
  per-account glance cards.

### J. Cursor - dashboard Overview (cursor-1.png)
Mobbin: /screens/0989128a-5b38-4bad-9969-4ae04436fa4e
- Current-plan card ("Pro - Current - $20/mo") beside an on-demand meter card ("$0 / $5 -
  On-Demand Usage this Month" with a hairline bar + "Edit Limit"); upgrade cards on top.
- "AI Line Edits" GitHub-style year heatmap with All/Tab/Agent segmented filter and
  Most Active Month/Day + streak stats.
- Why it's good: heatmap + streaks = engaging secondary history layer; plan card + meter
  pairing shows how plan context and quota coexist.

Also captured, weaker/rejected: github-2.png (GitHub Billing Summary), supabase-usage.png
(Supabase Billing: spend-cap toggle, "limited by the included usage" warning - good copy
reference for hard-cap semantics), grok.png (observability, not quota), openai-platform.png,
gemini.png, mistral.png, langdock.png, notebooklm.png, framer.png, lovable-2.png,
vercel-usage.png, cursor-2/3/4.png, supabase-usage2.png.

---

## 2. Recommendations

### Usage tab layout
1. Provider-grouped account cards, not a flat table. GitHub's product groups (B) map
   directly: one bordered group per provider (Claude, Codex/ChatGPT, Cursor, Copilot),
   header = provider icon + name + aggregate state; inside, one row/card per signed-in
   account (email + plan badge; GitHub's "2 organization accounts" line justifies grouping).
2. Per account: two Gemini-style meters (A). "Session - 34% used" and "Week - 61% used";
   thin rounded bar, % right-aligned, caption underneath: "Resets at 3:22 PM" (session) /
   "Resets Wed, Aug 19 at 1:22 PM" (weekly). Percent-first, tokens on hover. Add an
   "Updated 2m ago" stamp at the tab level (A).
3. Pace indicator via Railway's estimate pairing (E): e.g. "On pace: ~82% by reset" or the
   compressed form "2d 3h or 12% left". Color only by state: neutral fill <70%, amber
   70-90%, red >90% (all references keep bars neutral; reserve color for danger).
4. Per-model limits = AI Studio micro-bar table (C) inside the expanded account card:
   Model | 5h window | Weekly | (opt. RPM), each cell micro-bar + "used / limit"; "-" for
   dimensions a model doesn't have.
5. Secondary history layer = Cursor Usage (D) + Emergent ledger (F): rollup table
   (Account/Model | Tokens | % of quota) with bold parent rows, then a day-grouped event
   ledger with per-day totals and running quota balance; period picker 1d/7d/30d. Optional
   Cursor-style activity heatmap (J).
6. Spend/overage as sibling rows, not separate pages (B, D): "$0 / $5 on-demand this month -
   Edit limit" under the account's meters where a provider supports overage.
7. Use the recurring slash notation with muted denominator ("$0 / $25", "38.45/100",
   "0.00 of 2,000 min") everywhere for used-vs-limit.

### Compact dropdown meter (model picker)
- Bars, not rings. Every reference product uses horizontal bars; Braintrust (G) proves
  legibility at sidebar scale. A ring under 16px is unreadable and can't show two windows.
- Row layout (Braintrust G + AI Studio C): account name/email left; right-aligned micro-bar
  (~40-56px x 4px) + tiny "61%". Show only the more constrained of the two windows; tint
  amber/red by the same thresholds as the tab.
- Tooltip/hover card = miniature of pattern A: both meters + reset countdowns
  ("Session 34% - resets 3:22 PM / Week 61% - resets Wed 1:22 PM").
- If a whole provider is near-limit, surface a Railway-style pill (E) on the picker trigger
  itself ("1h 40m or 8% left") - one chip, scarcest resource wins.

### Copy/semantics worth stealing
- "Resets in 29 days" (relative, GitHub) for long windows; "Resets at 3:22 PM" (absolute,
  Gemini) for the 5h window.
- "Included" vocabulary for subscription quota (GitHub/Cursor/Vercel/Supabase all use it).
- Supabase's hard-cap warning pattern: state the consequence ("projects may become
  unresponsive when this organization exceeds its included usage quota").

---

## 3. Saved files (all in /tmp/mobbin-quota-research/)
Key references: gemini-weekly.png, github-1.png, aistudio.png, cursor-usage-1.png,
cursor-usage-2.png, cursor-1.png, railway.png, emergent.png, braintrust.png, lovable-1.png,
perplexity.png.
Secondary/rejected: github-2.png, supabase-usage.png, lovable-2.png, grok.png,
openai-platform.png, gemini.png, mistral.png, langdock.png, notebooklm.png, framer.png,
vercel-usage.png, cursor-2.png, cursor-3.png, cursor-4.png, supabase-usage2.png.
Search-result corpora: results-*.json (app + /screens/<id> href per query).
