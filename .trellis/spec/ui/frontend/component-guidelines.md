# Component Guidelines

## Rules

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- In `packages/ui`, shadcn primitives stay as kebab-case single files under `src/components/ui/`; custom components can use folder-per-component when outside that generator-owned area.

## Examples

- `packages/ui/src/components/ui/button.tsx`
- `packages/ui/src/components/ai-elements/message.tsx`
- `packages/ui/src/components/overflow-fade/OverflowFadeText/OverflowFadeText.tsx`
