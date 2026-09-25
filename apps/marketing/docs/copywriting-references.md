# Copywriting references: taglines & hero copy

Research compiled 2026-08-12 for the tagline repositioning (`update-tagline-value-prop`).
Use this when writing or reviewing any homepage/hero/landing copy.

## The four framework resources

| Resource | URL | Core rule |
|---|---|---|
| Julian Shapiro, Landing Page Handbook | julian.com/guide/growth/landing-pages | Header must be fully descriptive: "If the visitor reads only this text, will they know exactly what you sell?" Subheader = 1-2 sentences explaining how the bold claim is possible. |
| Harry Dry, Landing Page Guide | marketingexamples.com/conversion/landing-page-guide | Title = value, subtitle = how, image = visualize, social proof = believe, CTA = easy. Edit test: "Would this help me sell if I met the customer in person?" |
| April Dunford, positioning | aprildunford.com/post/a-quickstart-guide-to-positioning | Positioning is NOT a tagline; it is the input. Start from what customers would do without you, not phantom competitors. |
| Markepear (dev-tool teardowns) | markepear.dev/examples/landing-page | Category + differentiator in plain infrastructure nouns; quantified claims demonstrated, not asserted; CTAs in developer verbs ("Install", "Get API keys"). |

### Worked examples from those resources

- Julian, good: "Visually design and develop sites from scratch. No coding." / "Groceries delivered in 1 hour. Say goodbye to traffic, parking, and long lines."
- Julian, bad: "Improve your workflow!" / "Supercharge your collaboration!"
- Harry Dry: Privy "How small brands sell more online" (conviction) made believable by "18,000+ reviews", not by the words.
- Markepear's showcase heroes: Supabase "open-source Firebase alternative"; ClickHouse "Query billions of rows in milliseconds"; Fly.io "Launch Apps Near Users"; Snyk "Find and fix vulnerabilities in open-source software" (unchanged ~7 years); Neon "Fully managed serverless Postgres"; Alpaca "Stock trading API"; Bun (benchmarks in the header).
- Dunford's repositioning cases: database → "an AWESOME BI tool for machine-generated data" (escaped the "how are you better than Oracle" trap); Janna Systems generic CRM → "CRM for investment banks" ($2M → $70M in 18 months).

## The hacker-trusted canon (sources engineers actually respect)

### Doctrine

- **YC / Michael Seibel**, "How to Pitch Your Company" (ycombinator.com/blog/how-to-pitch-your-company): "You don't need to sound cool. You need to be clear." Eliminate jargon, acronyms, and "any ambiguous terms such as 'platform'." Airbnb test: "we allow you to rent out the extra room in your house" beats "we're a marketplace for space." Email test: two sentences to a smart friend; any clarifying question = revise.
- **37signals, Getting Real**, "Copywriting is Interface Design" (basecamp.com/gettingreal/09.7): "Great interfaces are written... every letter matters." No internal lingo; short and sweet.
- **Kathy Sierra, Badass: Making Users Awesome**: "People don't want to be badass at using your tool. They want to be badass at what your tool helps them do." Sell the user's new power in their domain, not the tool's capability.
- **patio11** (kalzumeus.com): sell the quantified business outcome; single blazingly-obvious goal per page; ad copy must anticipate landing copy. The counterweight to understatement: bold claims are fine when quantified and cashed.
- **swyx** (dx.tips): "benefits, not features" advice fails for developers — "we deal in building blocks... cut the marketing BS and try to explain how things work." Developers need ~14 exposures before adopting; the hero is one touch, so be exact, not maximal.

### Taglines HN reveres (verified exact text)

| Product | Tagline | Why respected |
|---|---|---|
| SQLite | "Small. Fast. Reliable. Choose any three." | Joke at marketing's expense; falsifiable; product cashes it |
| jQuery | "The Write Less, Do More, JavaScript Library" | Exact developer benefit in four words |
| Tailscale (early) | "Private networks made easy." | Praised on HN because the product delivered the "easy" |
| WireGuard | "fast, modern, secure VPN tunnel" | Reads like a man-page NAME line; zero business language |
| PostgreSQL | "The World's Most Advanced Open Source Relational Database" | Superlative engineers agree is true (vs MySQL's "most popular") |
| Tarsnap | "Online backups for the truly paranoid" | Names its niche with self-aware humor |
| Pinboard | "Social Bookmarking for Introverts" | Same: honest niche + personality |
| Ghostty | "...speed, features, or native UIs. Ghostty provides all three." | Conscious SQLite homage |
| Redis (today) | "Developers love Redis. Unlock the full potential..." | NEGATIVE control: the enterprise-speak HN mourns |

Common thread: falsifiable specificity over aspiration; category nouns developers already know; understatement or self-aware humor; no "empower/unlock/supercharge"; claims the product visibly cashes. HN has no "best taglines" mega-thread — taglines get praised in situ, next to a working product.

## How this graded our hero (2026-08-12)

H1 "Run 100+ Coding Agents in Parallel." + subtitle "Give Claude Code, Codex, or any CLI agent its own isolated workspace, automate recurring tasks, and stay on top of it all from anywhere."

Grade **B/B-** against the canon. Passes: fully descriptive (Julian), mechanism-register subtitle with concrete third-party nouns (swyx, Markepear), jargon-free for the audience (Seibel). Two flagged misalignments:

1. **Kathy Sierra test**: the H1 sells tool capacity (running agents) rather than the user's new power (shipping more). Nobody's aspiration is agent-herding.
2. **SQLite honesty test**: "100+" is a max-spec superlative, not a typical-use truth; HN's instinct is to poke at exactly this number ("who runs 100?"). Defensible in the patio11 quantified-boldness school, but the page must visibly cash the claim (demo showing real scale).

Minor: "stay on top of it all from anywhere" is the subtitle's one abstract clause; the subtitle appends two extra planks (automations, anywhere) where Dry would deepen the single title promise.

## Elite subtitle patterns (Linear/Stripe/Vercel/etc., fetched 2026-08-12)

Median 16 words (range 6-29); 1-2 sentences, never 3; zero colons; long subtitles earn length via parallel verb triplets (Stripe: "Accept payments, offer financial services, and implement custom revenue models"); concrete nouns; sentence 2 never opens a new feature list; H1 = claim, subtitle = mechanism.

## House style

The lintable subset of these rules is enforced by Vale: config in `apps/marketing/vale.ini`,
rules in `vale-styles/Superset/`, run with `bun run lint:prose` (errors fail CI via the
`vale` job in `ci.yml`). Paths are deliberately non-hidden: some local checkouts
(the Superset CLI settings exclude) carry a `.git/info/exclude` rule that ignores `.*`, so a
`.vale.ini` can sit invisible to `git status` and silently never get committed. Third-party
packages (proselint, write-good, alex, MDX) are vendored into `vale-styles/` by `vale sync` and
committed; they run advisory-only, calibrated in `vale.ini` (write-good.E-Prime,
alex.ProfanityUnlikely, and other false-positive-heavy rules are off). Vendored style files are
excluded from Biome and never hand-edited; recalibrate in `vale.ini` instead. Severity: em dashes, hype words, the AI-tell vocabulary from the
Notion "Kiet's Email voice" page (delve/leverage-as-verb/robust/seamless/crucial/comprehensive/
streamline/furthermore/additionally/effectively and friends), and performative phrasing are
errors; owned terms, signposting ("Here's the thing"), "not just X, but Y", and changelog
internal jargon (tRPC, Drizzle, package names) are warnings; "agentic" and Flesch-Kincaid
grade > 11 are suggestions. The Notion voice page is the source of truth for the voice rules;
sync the Vale style when it changes.

- No em dashes anywhere in marketing copy or README (repo-wide sweep, Aug 2026). Rewrite with colon, comma, period, or parentheses.
- Voice-of-customer vocabulary that converts (from HN/X research, Aug 2026): "parallel coding agents" (the converged category phrase), "without losing track", "terminal tabs don't scale", "babysitting" (pain), "native TUIs, no bloat", "worktrees". Avoid: "mission control" (GitHub owns it), "herding" (herdr owns it), "editor/IDE" (category the leaders exited), "agentic" (saturated).
