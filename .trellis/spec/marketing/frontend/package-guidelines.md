# @superset/marketing Frontend Package Guidelines

## Scope
Next.js marketing site, content pages, blog/changelog utilities, contact/enterprise actions, landing-page sections, SEO routes, and analytics.

## Source Examples
- `apps/marketing/src/app/components/HeroSection/HeroSection.tsx` and route-local components define landing sections.
- `apps/marketing/src/app/blog/components/BlogCard/BlogCard.tsx` shows content card structure.
- `apps/marketing/src/app/contact/actions.ts` validates, sanitizes, rate-limits, and sends contact emails.
- `apps/marketing/src/lib/blog.ts`, `changelog.ts`, `compare.ts`, and `marketplace.ts` own content data access.

## Local Patterns
- Keep reusable marketing sections under `src/app/components/<Component>`; keep page-specific components under the page route.
- Use server actions for forms and sanitize all submitted strings before sending email.
- Keep content parsing/data utilities in `src/lib` and route rendering in `src/app`.
- Use metadata routes such as `robots.ts`, `sitemap.ts`, `feed.xml/route.ts`, and `llms.txt/route.ts` for SEO/documentation outputs.

## Avoid
- Do not send raw form input to Resend or email templates.
- Do not put content parsing logic directly into page components.
- Do not create `middleware.ts`; use `proxy.ts` if request interception is needed.

## Validation
- `bun --cwd apps/marketing typecheck`
- `bun --cwd apps/marketing build` for route/content pipeline changes.
