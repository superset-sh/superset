# @superset/docs Frontend Package Guidelines

## Scope
Fumadocs/Next documentation site, MDX content, generated source files, shared layout, metadata routes, and public docs images.

## Source Examples
- `apps/docs/content/docs/*.mdx` contains documentation content.
- `apps/docs/source.config.ts` and `.source/*` configure/generated docs source.
- `apps/docs/src/lib/source.ts` and `layout.shared.tsx` wire docs UI.
- `apps/docs/package.json` runs `fumadocs-mdx` before build/typecheck.

## Local Patterns
- Put product docs in `content/docs` and keep `meta.json` navigation updated.
- Use docs images from `public/images/` when screenshots are referenced.
- Run `fumadocs-mdx` through package scripts before typechecking.
- Keep MDX components in `src/mdx-components.tsx`.

## Avoid
- Do not edit generated `.source` files manually unless the docs tooling requires it.
- Do not duplicate layout constants outside `src/lib/layout.shared.tsx`.

## Validation
- `bun --cwd apps/docs typecheck`
- `bun --cwd apps/docs build` for docs routing/config changes.
