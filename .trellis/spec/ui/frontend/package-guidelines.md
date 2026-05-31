# @superset/ui Frontend Package Guidelines

## Scope
Shared React UI library, shadcn components, AI elements, atoms, hooks, icons, CSS tokens, and low-level UI utilities.

## Source Examples
- `packages/ui/src/components/ui/button.tsx` shows shadcn/cva component style.
- `packages/ui/src/components/ai-elements/message.tsx` and `message.test.tsx` show AI element testing.
- `packages/ui/src/atoms/Avatar/Avatar.tsx` shows atom exports.
- `packages/ui/src/components/overflow-fade/OverflowFadeText/OverflowFadeText.tsx` shows folder-based local components.
- `packages/ui/src/lib/utils.ts` exports `cn` with `clsx` and `tailwind-merge`.

## Local Patterns
- Keep shadcn components in `src/components/ui/*.tsx` as kebab-case single files so the shadcn CLI can update them.
- Keep AI elements in `src/components/ai-elements/*.tsx` and test behavioral components.
- Use folder-based components for custom shared components outside shadcn exceptions.
- Use `cva` for variants where variants are part of the component API.
- Export shared icons from `src/assets/icons/preset-icons/index.ts`.

## Avoid
- Do not fork shadcn primitives inside apps when a shared UI package component exists.
- Do not add app-specific business logic to `@superset/ui`.
- Do not bypass `cn` when merging conditional Tailwind classes.

## Validation
- `bun --cwd packages/ui test`
- `bun --cwd packages/ui typecheck`
