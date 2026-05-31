# Component Guidelines

## Rules

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- In `packages/ui`, shadcn primitives stay as kebab-case single files under `src/components/ui/`; custom components can use folder-per-component when outside that generator-owned area.
- `@superset/ui/switch` is a local accessible switch implementation, not the Radix Switch wrapper. Do not reintroduce `@radix-ui/react-switch` there without a real desktop smoke that proves React 19 does not hit a callback-ref update loop.
- Model/provider logos must use bundled local SVG assets from `@superset/ui/icons/model-providers` or `packages/ui/src/assets/icons/model-providers`. Do not render model picker icons from `unpkg`, `models.dev`, or other remote logo URLs; remote icon loading causes incomplete model picker rows and flaky desktop acceptance.

## Common Mistakes

### Radix Switch Ref Loop

React 19 plus the current optimized desktop renderer hit `Maximum update depth
exceeded` when `@radix-ui/react-switch` repeatedly set its internal button ref
during V2 workspace mounting. The shared switch contract is:

- exported as `Switch` from `@superset/ui/switch`
- props: `checked`, `defaultChecked`, `onCheckedChange`, `disabled`, `required`, plus normal button props
- DOM contract: `button[type="button"][role="switch"]` with `aria-checked` and `data-state`
- visual contract: keep existing `data-slot="switch"` and `data-slot="switch-thumb"` classes so app styling remains stable

Wrong:

```tsx
import * as SwitchPrimitive from "@radix-ui/react-switch";
```

Correct:

```tsx
import { Switch } from "@superset/ui/switch";
```

Tests should include a source regression that `packages/ui/src/components/ui/switch.tsx`
does not import `@radix-ui/react-switch`, plus desktop smoke for any change to
the shared switch implementation.

### Model Provider Icon Loading

Model provider icons are part of the UI contract, not external content. The
current bundled registry exports:

- `getLocalLobeModelProviderIcon({ id, variant })` for model-family inference
  surfaces such as desktop Chat and Code model selectors
- `getLocalModelSelectorLogo(provider)` for `ModelSelectorLogo`

Wrong:

```tsx
<img src={`https://models.dev/logos/${provider}.svg`} />
```

Correct:

```tsx
import { getLocalModelSelectorLogo } from "../../assets/icons/model-providers";

const logo = getLocalModelSelectorLogo(provider);
```

Tests should assert implementation files do not contain remote logo hosts and
that resolved local icon URLs do not start with `http`.

### Model Selector Numeric Search

Numeric model-version queries such as `5.4`, `4.5`, or `120` must match only
user-visible model fields. The shared model selector helper should search:

- `model.name`
- provider-local `modelId`

Do not include internal database ids, provider ids, encoded gateway refs, or
provider names in numeric fuzzy matching. Punctuation-insensitive search turns
`5.4` into `54`; if hidden ids participate, unrelated rows with UUIDs or
encoded routing refs can appear in the picker.

Wrong:

```tsx
filterModelSelectorItem(model.id, query, [
	model.provider,
	model.providerId,
	encodedGatewayRef,
]);
```

Correct:

```tsx
filterModelSelectorItem(model.name, query, [
	model.name,
	model.modelId,
]);
```

Tests should include at least one model whose hidden `id`, `providerId`, or
provider label contains the numeric query while the visible model name does not.
Searching `5.4` must return only visible 5.4 models, while text searches such as
`got-5.5` can still use broader provider and model-family keywords.

## Examples

- `packages/ui/src/components/ui/button.tsx`
- `packages/ui/src/components/ai-elements/message.tsx`
- `packages/ui/src/components/overflow-fade/OverflowFadeText/OverflowFadeText.tsx`
