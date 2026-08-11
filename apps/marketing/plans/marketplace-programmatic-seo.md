# Marketplace programmatic SEO — scope

**Goal:** turn each marketplace theme (and later, agent) into its own indexable landing page, so the marketplace generates long-tail search traffic instead of hiding behind three list pages.

## Current state
- Routes: only `/marketplace`, `/marketplace/themes`, `/marketplace/agents` (list pages). No per-item detail route.
- Sitemap: only the three list pages are included.
- Theme data: `apps/marketing/src/lib/marketplace.ts` → `themeListings: ThemeListing[]` (**28 themes**), rich per-item data (name, type, author, description, tags, full UI + terminal color palette).
- Each theme is also a static download at `public/marketplace/themes/<slug>.json` (**27 files**) — these are what Google currently crawls as `*.json` (non-content noise).
- Agents: no `agentListings` data source exists yet in `marketplace.ts`; `/marketplace/agents` needs a data model before agent detail pages are possible.

## Proposal
1. **Route:** add `apps/marketing/src/app/marketplace/themes/[slug]/page.tsx` (SSG via `generateStaticParams()` over `themeListings`).
2. **Content per page** (enough to avoid thin-content): live palette preview (UI + terminal swatches from the existing data), short description, author/credit, tags, "how to install in Superset" steps, and a link to the raw `.json`.
3. **Metadata:** self-canonical `${MARKETING_URL}/marketplace/themes/<slug>`, unique title/description per theme, OG image (reuse a templated OG route).
4. **Structured data:** `CreativeWork`/`SoftwareApplication` JSON-LD + breadcrumb.
5. **Sitemap:** map `themeListings` into `sitemap.ts` (mirrors how blog/changelog/compare are already generated).
6. **Interlink:** list page cards link to detail pages; detail pages cross-link related themes (same `type`/tags).

## SEO impact
- ~28 net-new indexable pages immediately, targeting long-tail like "<theme> theme for Superset", "<theme> terminal colors", "<theme> for AI coding".
- Converts the crawled `*.json` noise into real HTML pages with a canonical, so the JSON stays a download and the page is what ranks.
- Compounds: every new submitted theme becomes a page automatically.

## Risks / notes
- **Thin content:** a bare palette isn't enough — include install steps + description + preview so each page has unique value.
- **Keep the `.json` downloadable:** the detail page links to it; don't break the existing download URL.
- **Dedupe:** canonical on detail pages; list page stays the hub (no canonical war).
- **Agents:** out of scope until an `agentListings` data source exists — flag as a follow-up.

## Rough effort
Small–medium: one dynamic route + one preview component + sitemap wiring + metadata/JSON-LD. No new data (themes already structured). Agent pages are a separate, larger task (needs data model first).
