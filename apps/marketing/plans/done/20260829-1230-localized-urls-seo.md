# Localized URLs for marketing: per-locale pages, metadata, and hreflang

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

superset.sh is translated into 16 languages, but search engines cannot see any of it: the locale is negotiated per request from the Accept-Language header, crawlers send English or nothing, and every URL serves exactly one document. After this change, each marketing page exists at a crawlable URL per locale — `superset.sh/pricing` (English, unchanged) and `superset.sh/ja/pricing`, `superset.sh/de/pricing`, and so on — each with its own localized `<title>` and `<meta description>`, `hreflang` alternate links tying the set together, and a sitemap that lists all of them. A Japanese developer searching in Japanese can then land on a Japanese page, and each of the ~500 page×locale combinations carries its own SEO surface.

To see it working after implementation: `curl -s https://superset.sh/ja/pricing | grep -E '<title>|hreflang|lang='` shows a Japanese title, `lang="ja"`, and 17 alternate links; Google Search Console (outside this plan) begins indexing the `/ja/` tree.

## Assumptions

- The 16 locale catalogs in `packages/i18n/locales/` remain complete (`compile --strict` gates this).
- The Translate Catalogs workflow (`.github/workflows/translate-catalogs.yml`) fills new catalog strings on PRs, so the ~60 new metadata strings this plan adds do not need hand-translation.
- Marketing pages are already dynamically rendered (the nav resolves the viewer's session per request), so per-locale dynamic rendering adds no new cost. Static generation per locale is possible later only if the session-aware nav moves to client-side fetching; that is out of scope and noted as a follow-up.

## Open Questions

- None blocking. The URL scheme (Decision 1) is the one irreversible product call; it was approved by Kiet before implementation began. Placeholder: Decision Log entry 1.

## Progress

- [x] (2026-08-29) M1: `[lang]` route tree, proxy rewrite/redirect, root-params locale, generateStaticParams; verified: bare=en, /ja=ja hero, /en→308, /xx→404, /llms.txt untouched.
- [x] (2026-08-29) M2: all 20 static pages -> generateMetadata with catalog messages + localizedAlternates; all 9 dynamic pages carry per-locale canonical + hreflang; 41 new ids left for the Translate Catalogs bot.
- [x] (2026-08-29) M3: sitemap emits every page x 17 locales with alternates (2,754 locs locally); switcher navigates to the locale URL via onSelect; smoke --localized is URL-based (bare must serve en even under a ja header).
- [ ] M4: PR opened; first CI round red on the catalog audit by design until the bot fills; gated merge after. Remaining: production verification + Search Console sitemap submission (Kiet).

## Surprises & Discoveries

- Observation: `next/root-params` is gated behind `experimental.rootParams` on Next 16.2.11; without it every page 500s with "Invalid import".
  Evidence: dev log "'next/root-params' can only be imported when `experimental.rootParams` is enabled"; flag added to next.config.ts where swcPlugins already lives.
- Observation: Python's glob treats `[lang]` as a character class, silently matching nothing — file transforms must use os.walk.
- Observation: React SSR renders the attribute as `hrefLang` (camelCase); a case-sensitive grep reports zero alternates that are in fact present. Crawlers parse attributes case-insensitively.
- Observation: the hardcoded-strings ratchet's ENFORCED_DIRS carries absolute app paths; the tree move required updating six marketing entries to the [lang] locations.

## Decision Log

- Decision 5: Enable `experimental.rootParams` in apps/marketing/next.config.ts.
  Rationale: `next/root-params` is the documented mechanism for reading the [lang] segment anywhere server-side and is gated by this flag on 16.2.11; marketing already runs experimental options (swcPlugins). The fallback (threading params through 31 signatures) costs far more.
  Date/Author: 2026-08-29 / agent.

- Decision 1: English stays at bare paths (`/pricing`); other locales get a path prefix (`/ja/pricing`). Implemented by keeping one route tree under `app/[lang]/` and using proxy rewrites so bare paths render with `lang=en`.
  Rationale: preserves every existing URL and inbound backlink — the SEO-safest scheme; `x-default` and `en` hreflang point at the bare URL. Redirecting `/pricing → /en/pricing` would put all accumulated link equity behind a redirect for no benefit.
  Date/Author: 2026-08-29 / Kiet + agent.
- Decision 2: No automatic Accept-Language redirect from bare URLs to locale URLs.
  Rationale: Google's guidance — locale auto-redirects hide content from crawlers (which send `en` or nothing) and break shared links. Discovery of localized pages is the job of hreflang, the sitemap, and the visible language switcher. The existing `superset_locale` cookie continues to drive the client-resolved apps (docs, web) and may later power a "view this page in 日本語?" suggestion banner, which is explicitly out of scope here.
  Date/Author: 2026-08-29 / agent, per Next.js and Google i18n guidance.
- Decision 3: The locale reaches server code via the `[lang]` root param (`next/root-params`' `lang()` getter), replacing header/cookie sniffing in `apps/marketing/src/app/i18n-server.ts`. Header and cookie remain only as inputs to the switcher's initial suggestion.
  Rationale: this is the documented architecture (Lingui RSC tutorial, Next i18n guide): the locale becomes structural (part of the URL) instead of ambient, so every server component and utility reads one source of truth.
  Date/Author: 2026-08-29 / agent.
- Decision 4: Per-page metadata (title, description) moves into catalog messages rendered by `generateMetadata`, reversing the earlier "SEO metadata stays English" rule for marketing only.
  Rationale: localized metadata on localized URLs is the point of the exercise — the snippet a Japanese searcher sees should be Japanese. Long-form MDX (blog/changelog bodies) and legal pages stay English; their localized URLs still get localized chrome and hreflang.
  Date/Author: 2026-08-29 / Kiet ("each page has its own SEO").

## Outcomes & Retrospective

Shipped and verified in production on 2026-08-29 (PR #7002, squash f5f671bb0). Every marketing
page serves 17 locales at /{locale} paths with English at bare URLs; production smoke confirmed
/ja/pricing renders lang="ja" with Japanese content, the bare /pricing stays English even under
a ja Accept-Language header, /en/pricing 308s to the bare URL, and the sitemap carries 2,754
localized entries with hreflang alternates. Follow-ups that landed in the same arc: the
deterministic-first-render hydration fix (PR #7005), the docs compact switcher icon (#7001),
and the Figma-style footer picker (#7006).

Retrospective. What went well: the proxy rewrite plus root-params design survived contact with
production unchanged, and the decision to keep English at bare URLs meant zero backlink
breakage. What cost time: a falsely reported merge (the lesson is now a standing rule — verify
PR state MERGED and main's tip before saying "merged"); Turbopack panics from branch-switching
under a running dev server; and three environment traps recorded in Surprises (rootParams
gating, [lang] as a glob character class, camelCased hrefLang in SSR output). Remaining
user-owned steps: submit the sitemap in Search Console; create VERCEL_AUTOMATION_BYPASS_SECRET
so preview smoke stops being vacuous behind SSO (#6993). Docs-body translation was evaluated
and deliberately declined on 2026-08-29 (high churn, prose re-translation automation cost,
correctness risk); revisit only with evidence of non-English docs demand or a Japan enterprise
motion.

Note (2026-08-29): closeout added and plan moved to done/ on completion of the arc.

## Context and Orientation

App affected: `apps/marketing` only (Next.js 16 App Router). Packages involved: `packages/i18n` (locale list `SUPPORTED_LOCALES` in `src/locales.ts`; the server seeding helper `@superset/i18n/server`; the `LanguageSwitcher` component in `src/react.tsx`). The docs and web apps are explicitly out of scope (client-resolved; see the docs-translation decision of 2026-08-29 — docs bodies stay English).

Terms: a "route entry" is a `page.tsx` or `not-found.tsx` under `apps/marketing/src/app/`; "RSC seeding" is the required per-entry call `await initServerI18n()` that activates the Lingui i18n instance for a server render (enforced by `packages/i18n/test/rsc-seeding.test.ts`); a "proxy" is Next 16's request-interception file (`apps/marketing/src/proxy.ts`, the successor of `middleware.ts`) that can rewrite an incoming URL to a different internal path before rendering; `hreflang` alternates are `<link rel="alternate" hreflang="ja" href=".../ja/pricing">` tags that tell search engines which URLs are translations of each other.

Current state: every route entry calls `await initServerI18n()`, which resolves the locale from the `superset_locale` cookie, then the Accept-Language header (`apps/marketing/src/app/i18n-server.ts`). `<html lang>` comes from that resolution in `apps/marketing/src/app/layout.tsx`. Deploy smoke checks live in `scripts/smoke-routes.ts` (`--localized` fetches with `Accept-Language: ja` and asserts served `lang="ja"` + CJK content) wired in `.github/workflows/deploy-preview.yml`.

## Plan of Work

### Milestone 1: the `[lang]` route tree

Move everything under `apps/marketing/src/app/` that is a page, layout, or page-scoped component directory into `apps/marketing/src/app/[lang]/`, EXCEPT: `api/` routes, `sitemap.ts`, `robots.ts`, `manifest`/icon files, opengraph-image routes that must keep their URLs, `i18n-server.ts`, `providers.tsx`, and `globals.css` (imports adjusted). Fix the `@/app/...` imports mechanically (`@/app/components/...` → the new location; prefer moving shared components to `apps/marketing/src/components/` to keep import paths bracket-free — decide file-by-file, biome check verifies).

Create `apps/marketing/src/proxy.ts`: for a request whose first path segment is NOT a supported locale, rewrite to `/en{pathname}` (internal — the URL bar and crawlers still see the bare path). For a first segment that IS a supported locale, pass through. Exclude `_next`, `api`, static files by matcher. `SUPPORTED_LOCALES` imports from `@superset/i18n` — verify the proxy bundle accepts that import; if the edge bundle chokes on the package, inline the locale list with a comment pointing at the source of truth and a test asserting they match.

Rewrite `apps/marketing/src/app/i18n-server.ts`: `initServerI18n()` reads `const locale = await lang()` from `next/root-params`, validates with `isSupportedLocale` (invalid → `notFound()`), preloads and activates as today, returns the locale. Root layout moves to `app/[lang]/layout.tsx` and renders `<html lang={locale}>`. Add `generateStaticParams` returning all supported locales on the layout so Next knows the param space (pages remain dynamic because of the session nav; that is fine).

Update `packages/i18n/test/rsc-seeding.test.ts` route-entry glob to the new tree (it scans `app/`; the `[lang]` segment is inside `app/`, so likely no change — verify, and prove the ratchet still fails on a de-seeded page).

Acceptance: `cd apps/marketing && bun run dev`, then `curl -s localhost:6542/pricing | grep 'lang="en"'` and `curl -s localhost:6542/ja/pricing` shows `lang="ja"` and the Japanese hero (どのチームにも分かりやすい料金); `curl localhost:6542/xx/pricing` returns 404.

### Milestone 2: per-page localized metadata, hreflang, canonical

Add to each page a `generateMetadata` that: awaits `initServerI18n()`, builds `title` and `description` from catalog messages with explicit ids (`marketing.meta.<page>.title` / `.description`, English defaults = the current hardcoded strings), and sets `alternates`: `canonical` to the page's own locale URL, `languages` mapping every supported locale to its URL plus `x-default` to the bare English URL. Factor the alternates construction into one helper `apps/marketing/src/app/[lang]/metadata.ts` (`localizedMetadata({ lang, path, title, description })`) so 31 pages don't hand-roll URL math. Leave the ~60 new catalog strings untranslated for the Translate Catalogs bot.

Acceptance: `curl -s localhost:6542/ja/pricing | grep -c 'hreflang'` = 18 (17 locales + x-default); `<title>` is Japanese; `curl -s localhost:6542/pricing` canonical is the bare URL.

### Milestone 3: sitemap, switcher navigation, smoke gate

`apps/marketing/src/app/sitemap.ts`: emit every static route × every locale with `alternates.languages`. Dynamic slug families (blog, changelog, compare, themes, team) emit per-locale URLs from the same slug lists they use today.

`LanguageSwitcher` in `packages/i18n/src/react.tsx` gains an optional `onSelect(locale)` prop; when provided it is called instead of the cookie+reload path. Marketing's footer passes a handler that sets the cookie (still useful for docs/web) and navigates to the same path under the chosen locale (bare for en). Docs keeps the reload behavior (no localized URLs there).

`scripts/smoke-routes.ts --localized` changes from header-based to URL-based for marketing: fetch `/ja${route}` and assert `lang="ja"` + CJK, and fetch the bare route asserting `lang="en"`. Keep the header-based mode behind the existing flag for apps without localized URLs.

Acceptance: sitemap contains `https://superset.sh/ja/pricing`; clicking 日本語 in the footer navigates to `/ja/<current-path>`; the smoke matrix passes locally.

### Milestone 4: verification and merge

Full local matrix (all 17 locales × `/`, `/pricing`, one dynamic slug; 404 for bogus locale; soft-nav click-through under `/ja/`), `bun run typecheck`, `bun run lint`, `bun test`, `bun run --cwd packages/i18n check`. Ship as one PR (the tree move is not divisible without breaking main); gated merge per the standing rules (CI green → preview smoke → no major/critical review threads). After production deploy, verify `superset.sh/ja/pricing` live and submit the sitemap in Search Console (manual, Kiet).

## Concrete Steps

    cd /path/to/repo
    git checkout -b marketing-localized-urls origin/main
    # M1 file moves via git mv, then:
    bun run --cwd apps/marketing typecheck
    bunx biome check apps/marketing
    bun test packages/i18n     # rsc-seeding ratchet still enforces
    cd apps/marketing && bun run dev
    curl -s localhost:6542/ja/pricing | grep -E 'lang="ja"'

## Validation and Acceptance

See per-milestone acceptance above. End-to-end: with `bun dev` running, `/pricing` is English with `lang="en"`, `/ja/pricing` is Japanese with `lang="ja"`, both carry 18 hreflang links naming each other, `/xx/pricing` 404s, the footer switcher navigates between them, and `bun run typecheck && bun run lint && bun test` are clean.

## Idempotence and Recovery

The tree move is one commit; if anything goes wrong mid-move, `git checkout origin/main -- apps/marketing` restores. The proxy rewrite is additive — removing `proxy.ts` reverts to serving the `[lang]` tree only at prefixed URLs (bare paths would 404, so never ship without it; the smoke gate's bare-path check guards this). Catalog changes regenerate; never hand-merge `.po` conflicts — re-run `bunx lingui extract --clean` and refill.

## Interfaces and Dependencies

`next/root-params` (`lang()` getter) — Next 16, already in use elsewhere per Next docs; no new dependencies. `apps/marketing/src/app/[lang]/metadata.ts` must export `localizedMetadata({ lang, path, title, description }): Metadata`. `packages/i18n/src/react.tsx` `LanguageSwitcherProps` gains `onSelect?: (locale: SupportedLocale) => void`.
