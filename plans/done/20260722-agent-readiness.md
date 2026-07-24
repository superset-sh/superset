# Agent readiness (orank remediation)

Shipped 2026-07-22 against the [orank scan](https://ora.ai/score/superset.sh) (59/100). Goal: make superset.sh discoverable and usable by AI agents — markdown surfaces, MCP discovery, auth metadata, structured errors. Rescan after deploy: `POST https://ora.ai/api/scan {"url":"superset.sh"}`.

**Growth** = how much this helps agents/AI search find, cite, and use Superset. **Debt** = ongoing maintenance risk.

## Shipped

| Change | Where | Growth | Debt |
|---|---|---|---|
| llms.txt: when-to-use + developer-resource index (MCP, OpenAPI, auth.md, CLI, SDK) | `marketing/src/lib/llms.ts` + routes | **High** — the primary agent entry point; names every resource for name-based search | Low — built from constants + content dirs |
| Markdown surfaces: `/index.md`, `/llms.md`, `/agents.md`, `.md` twins for blog/compare, `Accept: text/markdown` negotiation, `?mode=agent` | `marketing/src/proxy.ts`, `app/md/[...path]`, `app/*.md/` | **High** — cold-arrival agents get clean markdown instead of hydration blobs; twins derive from the same MDX, no duplication | Low–Med — proxy.ts is new infra on `/`, `/blog/:slug`, `/compare/:slug`; matcher is narrow |
| MCP discovery: `/.well-known/mcp` + server card; api card introspects live server (`tools/list`) | `api` + `marketing` `.well-known/mcp/` | **High** — MCP is the actual product surface for agents; card can't drift from code | Low — self-updating; marketing proxies api with static fallback |
| `/auth.md` (WorkOS convention) + PRM `resource_documentation` + `agent_auth` block in AS metadata | `marketing/app/auth.md`, `api/lib/agent-auth-metadata.ts` | **Med-High** — agents self-serve credentials end-to-end without a human reading docs | Low — documents RFC-stable better-auth endpoints; `agent_auth` URIs read from live metadata |
| JSON API errors: 401 + `WWW-Authenticate` at `/api`, JSON 404 catch-all for `/api/*` | `api/app/api/route.ts`, `api/app/api/[...unmatched]/` | **Med** — agents recover from errors instead of parsing HTML | Low — but catch-all answers all unmatched `/api/*`; keep in mind when adding routes |
| robots.txt AI tiers (allow AI search/user agents; block CCBot/Bytespider) + Content-Signal `ai-train=yes` | `marketing/app/robots.txt/` | **Med** — explicit welcome signal to AI crawlers; train=yes keeps us in future model knowledge | Low — static text; revisit the train stance deliberately, not per-scan |
| docs `/llms.txt` index + blog/compare scoped llms.txt | `docs/app/llms.txt/`, `marketing/app/{blog,compare}/llms.txt/` | **Med** — scoped context for agents; docs already had `llms-full.txt` + per-page `/llms.mdx/*` | Low — generated from sources |
| JSON-LD: Organization contactPoint/address/sameAs, WebPage speakable, Service; contact-page prose | `marketing/components/JsonLd/`, `contact/page.tsx` | **Med** — entity disambiguation + trust checks AI assistants run before recommending | Low — static schema |
| A2A agent card + RFC 9727 `api-catalog` + RFC 8288 Link headers on `/` | `marketing/.well-known/`, `next.config.ts` | **Low** — emerging standards, little real traffic today; card honestly states we speak MCP, not A2A | Low — static, but 3 more files repeating the same URLs; consolidate if they drift |

## Dropped (deliberately)

- `/openapi.json` — shipped then removed. Our API is MCP (JSON-RPC over one endpoint), so an OpenAPI spec reduces to a single generic operation no function-calling framework can use; the real catalog is the live server card / `tools/list`, and auth is discoverable via RFC metadata + auth.md. Forfeits ~7-9 scanner pts but avoids the only hand-maintained artifact. Revisit only if we ever expose per-tool REST.
- NLWeb `schemamap.xml` / `/ask` — would have invented an unverifiable format / real endpoint work for negligible reach.
- 401 stubs at `/v1`, `/v2`, `/agent/auth` — fake entry points; scanner-gaming.
- Web Bot Auth key directory — publishing keys nothing signs with is theater.
- Marketing mirror of openapi.json — duplication; discovery covers it via links.

## Not codebase-fixable (external actions, ~16 pts)

Wikipedia/Wikidata entity (needs press for notability), ChatGPT app directory, skills.sh self-publish (`npx skills add` on `.agents/skills`), PyPI/Go/Ruby SDKs, real sandbox mode, MCP Apps `ui://`, NLWeb.

## Known caveat

Homepage HTML variant cannot carry `Vary: Accept` — Next.js owns Vary for HTML routes and drops middleware/config overrides. Markdown responses do carry it (what the negotiation contract measures); `/` renders dynamically so cache-poisoning risk is low. Fixing fully would need a Vercel-layer header rule.
