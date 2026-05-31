# @superset/typescript Frontend Package Guidelines

## Scope
Shared TypeScript configuration package for internal packages, Electron, and Next.js apps.

## Source Examples
- `tooling/typescript/base.json` is the shared base config.
- `tooling/typescript/internal-package.json` is used by workspace packages.
- `tooling/typescript/electron.json` covers Electron-specific settings.
- `tooling/typescript/next.json` covers Next.js apps.

## Local Patterns
- Extend the appropriate shared config from package/app `tsconfig.json` files.
- Keep config changes broad and intentional; many packages inherit these files.
- Run broad typecheck after changing shared TS config.

## Avoid
- Do not add package-specific path aliases to shared configs unless every consumer should inherit them.
- Do not weaken strictness to work around one package error.

## Validation
- `bun run typecheck` after shared config changes.
