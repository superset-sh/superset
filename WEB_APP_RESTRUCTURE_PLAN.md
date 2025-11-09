# Web App Restructuring Plan

## Principles

1. **Co-location**: Everything used only once should live next to where it's used
2. **Component Structure**: Each component gets its own directory with:
   - `ComponentName/ComponentName.tsx` - The component implementation
   - `ComponentName/index.ts` - Barrel export
   - `ComponentName/ComponentName.test.tsx` - Tests (when added)
   - `ComponentName/ComponentName.stories.tsx` - Storybook stories (when added)
   - `ComponentName/components/` - Sub-components only used here
   - `ComponentName/hooks/` - Hooks only used here
   - `ComponentName/utils/` - Utils only used here
3. **Shared vs Local**: Only truly reusable/global items go in shared directories
4. **Import Paths**: Use relative imports for local files, `@/` alias for shared

---

## Current Structure

```
apps/website/src/
├── app/
│   ├── api/trpc/[trpc]/route.ts
│   ├── blog/ (Nextra MDX)
│   ├── docs/ (Nextra MDX)
│   ├── layout.tsx
│   ├── page.tsx (419 lines - all sections inline)
│   └── globals.css
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── WaitlistModal.tsx
│   ├── motion/ (FadeUp, HeroParallax, TiltCard)
│   └── three/ (HeroCanvas)
└── trpc/
    ├── server.tsx
    ├── react.tsx
    └── query-client.ts
```

**Issues:**
- 419-line `page.tsx` with inline sections that can't be tested independently
- No clear distinction between page-specific vs shared components
- Components that might be reusable are all in global `/components/`
- No organized place for page-specific utils, hooks, or data

---

## Proposed New Structure

```
apps/website/src/
├── app/
│   ├── page.tsx                             # Home page (orchestrates sections)
│   ├── components/                          # Page-specific components (for root page)
│   │   │   ├── HeroSection/
│   │   │   │   ├── HeroSection.tsx
│   │   │   │   ├── index.ts
│   │   │   │   ├── components/             # Sub-components
│   │   │   │   │   └── HeroBackground/
│   │   │   │   │       ├── HeroBackground.tsx
│   │   │   │   │       └── index.ts
│   │   │   │   └── hooks/
│   │   │   │       └── useHeroAnimation.ts
│   │   │   │
│   │   │   ├── ClientLogosSection/
│   │   │   │   ├── ClientLogosSection.tsx
│   │   │   │   ├── index.ts
│   │   │   │   ├── components/
│   │   │   │   │   └── LogoCard/
│   │   │   │   │       ├── LogoCard.tsx
│   │   │   │   │       └── index.ts
│   │   │   │   └── constants.ts           # CLIENT_LOGOS data
│   │   │   │
│   │   │   ├── ScaleFeaturesSection/
│   │   │   │   ├── ScaleFeaturesSection.tsx
│   │   │   │   ├── index.ts
│   │   │   │   ├── components/
│   │   │   │   │   └── ScaleFeatureCard/
│   │   │   │   │       ├── ScaleFeatureCard.tsx
│   │   │   │   │       └── index.ts
│   │   │   │   └── constants.ts           # SCALE_FEATURES data
│   │   │   │
│   │   │   └── FeaturesSection/
│   │   │       ├── FeaturesSection.tsx
│   │   │       ├── index.ts
│   │   │       └── components/
│   │   │           └── FeatureCard/
│   │   │               ├── FeatureCard.tsx
│   │   │               └── index.ts
│   │   │
│   ├── hooks/                              # Root page specific hooks
│   │   └── useScrollProgress.ts            # Example (if needed)
│   │
│   └── utils/                              # Root page specific utilities
│       └── animations.ts                   # Example (if needed)
│
│   ├── blog/                               # Nextra blog (stays as-is)
│   │   ├── layout.tsx
│   │   ├── page.mdx
│   │   └── *.mdx
│   │
│   ├── docs/                               # Nextra docs (stays as-is)
│   │   ├── layout.tsx
│   │   ├── page.mdx
│   │   └── getting-started/
│   │
│   ├── api/
│   │   └── trpc/[trpc]/route.ts
│   │
│   ├── layout.tsx                          # Root layout
│   ├── globals.css                         # Global styles
│   └── favicon.ico
│
├── components/                             # ONLY truly shared components
│   ├── layout/                             # Layout components (used site-wide)
│   │   ├── Header/
│   │   │   ├── Header.tsx
│   │   │   ├── index.ts
│   │   │   └── components/
│   │   │       └── NavLink/
│   │   │           ├── NavLink.tsx
│   │   │           └── index.ts
│   │   │
│   │   ├── Footer/
│   │   │   ├── Footer.tsx
│   │   │   ├── index.ts
│   │   │   └── components/
│   │   │       └── SocialLink/
│   │   │           ├── SocialLink.tsx
│   │   │           └── index.ts
│   │   │
│   │   └── WaitlistModal/
│   │       ├── WaitlistModal.tsx
│   │       └── index.ts
│   │
│   ├── motion/                             # Reusable animation components
│   │   ├── FadeUp/
│   │   │   ├── FadeUp.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── HeroParallax/
│   │   │   ├── HeroParallax.tsx
│   │   │   ├── index.ts
│   │   │   └── hooks/
│   │   │       └── useHeroVisibility.ts
│   │   │
│   │   └── TiltCard/
│   │       ├── TiltCard.tsx
│   │       └── index.ts
│   │
│   └── three/                              # 3D components
│       └── HeroCanvas/
│           ├── HeroCanvas.tsx
│           ├── index.ts
│           ├── shaders/                    # Shader code
│           │   ├── vertex.ts               # Vertex shader
│           │   └── fragment.ts             # Fragment shader
│           └── config.ts                   # Configuration constants
│
├── lib/                                    # Shared utilities & configurations
│   ├── hooks/                              # Global custom hooks
│   │   ├── useMediaQuery.ts
│   │   └── useLocalStorage.ts
│   │
│   ├── utils/                              # Global utility functions
│   │   ├── cn.ts                           # Tailwind merge util
│   │   └── analytics.ts
│   │
│   └── stores/                             # Global state (Zustand, etc.)
│       └── theme.ts                        # Example: theme store
│
└── trpc/                                   # tRPC configuration (stays as-is)
    ├── server.tsx
    ├── react.tsx
    └── query-client.ts
```

---

## Key Changes Breakdown

### 1. Home Page Restructuring

**Before:**
```tsx
// apps/website/src/app/page.tsx (419 lines)
function HeroSection() { ... }
function FeatureCard() { ... }
function ClientLogosSection() { ... }
// ... all inline
export default function Home() { ... }
```

**After:**
```tsx
// apps/website/src/app/page.tsx (~50 lines)
import { HeroSection } from './components/HeroSection';
import { ClientLogosSection } from './components/ClientLogosSection';
import { ScaleFeaturesSection } from './components/ScaleFeaturesSection';
import { FeaturesSection } from './components/FeaturesSection';

export default function Home() {
  return (
    <>
      <HeroSection />
      <ClientLogosSection />
      <ScaleFeaturesSection />
      <FeaturesSection />
    </>
  );
}
```

**Benefits:**
- Each section can be tested independently
- Clear separation of concerns
- Easy to add Storybook stories per section
- Smaller, more maintainable files

---

### 2. Component Directory Structure

**Example: ScaleFeaturesSection**

```
ScaleFeaturesSection/
├── ScaleFeaturesSection.tsx      # Main component
├── index.ts                      # Barrel export
├── components/                   # Sub-components
│   └── ScaleFeatureCard/
│       ├── ScaleFeatureCard.tsx
│       └── index.ts
└── constants.ts                  # SCALE_FEATURES data
```

**ScaleFeaturesSection.tsx:**
```tsx
import { ScaleFeatureCard } from './components/ScaleFeatureCard';
import { SCALE_FEATURES } from './constants';

export function ScaleFeaturesSection() {
  return (
    <section>
      {SCALE_FEATURES.map((feature) => (
        <ScaleFeatureCard key={feature.id} {...feature} />
      ))}
    </section>
  );
}
```

**constants.ts:**
```ts
export const SCALE_FEATURES = [
  { id: 1, title: 'Feature 1', ... },
  // ...
];
```

**index.ts:**
```ts
export { ScaleFeaturesSection } from './ScaleFeaturesSection';
export type { ScaleFeature } from './constants';
```

---

### 3. Shared Components Organization

**Layout Components** (`components/layout/`)
- Used across multiple pages/routes
- Examples: Header, Footer, WaitlistModal
- Each gets own directory with tests

**Motion Components** (`components/motion/`)
- Reusable animation wrappers
- FadeUp, HeroParallax, TiltCard
- Used across multiple pages

**Three.js Components** (`components/three/`)
- HeroCanvas with shaders
- Extract config to separate file
- Consider extracting shaders to `.glsl` files

---

### 4. Lib Directory for Shared Resources

**`lib/hooks/`** - Only hooks used in 2+ places
```ts
// apps/website/src/lib/hooks/useMediaQuery.ts
export function useMediaQuery(query: string) { ... }
```

**`lib/utils/`** - Only utils used in 2+ places
```ts
// apps/website/src/lib/utils/analytics.ts
export function trackEvent(name: string, data?: Record<string, unknown>) { ... }
```

**`lib/stores/`** - Global state (Zustand)
```ts
// apps/website/src/lib/stores/theme.ts
import { create } from 'zustand';

export const useThemeStore = create((set) => ({ ... }));
```

---

### 5. Import Patterns

**Page-level imports (relative):**
```tsx
// In apps/website/src/app/page.tsx
import { HeroSection } from './components/HeroSection';
import { useScrollProgress } from './hooks/useScrollProgress';
```

**Shared component imports (absolute alias):**
```tsx
// In apps/website/src/app/components/HeroSection/HeroSection.tsx
import { Header } from '@/components/layout/Header';
import { FadeUp } from '@/components/motion/FadeUp';
import { HeroCanvas } from '@/components/three/HeroCanvas';
```

**Package imports:**
```tsx
import { Button } from '@superset/ui/button';
import { motion } from 'framer-motion';
```

---

## Migration Strategy

### Phase 1: Create New Directory Structure
1. Create `app/components/` for page-specific components
2. Create `components/layout/`, `components/motion/`, `components/three/`
3. Create `lib/hooks/`, `lib/utils/`, `lib/stores/` (as needed)

### Phase 2: Extract Home Page Sections
1. Extract `HeroSection` component
2. Extract `ClientLogosSection` with constants
3. Extract `ScaleFeaturesSection` with constants
4. Extract `FeaturesSection`
5. Update `page.tsx` to import sections

### Phase 3: Reorganize Shared Components
1. Move `Header.tsx` → `components/layout/Header/`
2. Move `Footer.tsx` → `components/layout/Footer/`
3. Move `WaitlistModal.tsx` → `components/layout/WaitlistModal/`
4. Restructure motion components (add tests, stories placeholders)
5. Restructure three components (extract config, shaders)

### Phase 4: Add Barrel Exports
1. Add `index.ts` to each component directory
2. Update all imports to use barrel exports

### Phase 5: Future Testing Setup (Not Now)
1. Tests and Storybook stories will be added later
2. Focus on structure and component extraction first

---

## Future Expansion Pattern

### Adding a New Page (e.g., `/pricing`)

```
app/pricing/
├── page.tsx                      # Main page
├── components/                   # Page-specific components
│   ├── PricingHero/
│   │   ├── PricingHero.tsx
│   │   ├── PricingHero.test.tsx
│   │   └── index.ts
│   └── PricingTiers/
│       ├── PricingTiers.tsx
│       ├── PricingTiers.test.tsx
│       ├── index.ts
│       ├── components/
│       │   └── TierCard/
│       │       ├── TierCard.tsx
│       │       └── index.ts
│       └── constants.ts          # Pricing data
├── hooks/
│   └── usePricingCalculator.ts  # Page-specific hook
└── utils/
    └── pricing.ts               # Page-specific utility
```

**Pattern:**
- Start with components co-located with the page
- If a component is used on 2+ pages, promote to `@/components/`
- If a hook is used on 2+ pages, promote to `@/lib/hooks/`
- Same for utils and stores

---

## Rules for Decision Making

### When to Co-locate
- ✅ Component used in only 1 page
- ✅ Hook used in only 1 component/page
- ✅ Util function used in only 1 place
- ✅ Constants/data used in only 1 place
- ✅ Tests for a specific component
- ✅ Stories for a specific component

### When to Make Shared
- ✅ Component used in 2+ pages
- ✅ Layout components (Header, Footer)
- ✅ Hook used in 2+ components
- ✅ Util used in 2+ places
- ✅ Global state/stores
- ✅ Theme/design system components

### Component Directory Checklist
- [ ] Component name matches directory name
- [ ] Has `index.ts` barrel export
- [ ] Sub-components in `components/` subdirectory
- [ ] Hooks in `hooks/` subdirectory (if page/component-specific)
- [ ] Utils in `utils/` subdirectory (if page/component-specific)
- [ ] Constants in `constants.ts` (if page/component-specific)

---

## Testing Strategy (Future)

Tests and Storybook stories will be added later. For now, focus on:
- Breaking components into logical pieces
- Proper directory structure
- Clean barrel exports

---

## Benefits Summary

### Developer Experience
- ✅ Easier to find related code (everything in one place)
- ✅ Smaller, focused files (100-200 lines vs 400+)
- ✅ Clear boundaries between page-specific and shared
- ✅ Easy to test components in isolation
- ✅ Better IDE navigation with barrel exports

### Maintainability
- ✅ Reduced cognitive load (one directory = one feature)
- ✅ Easier refactoring (move entire directory)
- ✅ Clear promotion path (local → shared)
- ✅ Scales well with team growth

### Code Quality
- ✅ Encourages component reusability
- ✅ Forces thinking about boundaries
- ✅ Makes tests more discoverable
- ✅ Clearer dependency graph

---

## Decisions

1. **Tests/Stories**: Skip for now - focus on structure
2. **HeroCanvas Shaders**: Extract to `shaders/` directory
3. **Route Groups**: Skip `(home)` - keep root `page.tsx` as-is
4. **Animation Library**: Keep in `@/components/motion/` (website-specific)

---

## Next Steps

1. Begin Phase 1: Create directory structure
2. Phase 2: Extract home page sections with sub-components
3. Phase 3: Reorganize shared components into directories
4. Phase 4: Add barrel exports
5. Update TypeScript paths if needed
6. Document patterns in CONTRIBUTING.md (optional)
