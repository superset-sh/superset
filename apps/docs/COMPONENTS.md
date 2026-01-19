# Better Auth Component Migration Plan

## Overview
Better Auth has ~130+ component files. This plan categorizes them and identifies which ones to migrate to Superset docs.

---

## ✅ Components to Copy

### 1. **UI Components** (`components/ui/`)
These are shadcn/ui and custom UI components. Many are useful for docs.

**High Priority - Copy These:**
- `callout.tsx` - Styled callouts for tips/warnings/notes
- `code-block.tsx` - Enhanced code block component
- `dynamic-code-block.tsx` - Code blocks with dynamic content
- `badge.tsx` - Badge component for labels
- `card.tsx` - Card component for content sections
- `tabs.tsx` - Tab component (better than default)
- `tooltip.tsx` - Tooltip component
- `separator.tsx` - Visual separator
- `dialog.tsx` - Modal dialog
- `popover.tsx` - Popover component
- `dropdown-menu.tsx` - Dropdown menu
- `alert.tsx` - Alert component for messages
- `skeleton.tsx` - Loading skeleton
- `fade-in.tsx` - Fade in animation wrapper
- `background-beams.tsx` - Cool background effect
- `background-boxes.tsx` - Animated background boxes
- `sparkles.tsx` - Sparkle effect component
- `use-copy-button.tsx` - Copy button hook

**Medium Priority:**
- `accordion.tsx` - Accordion component
- `breadcrumb.tsx` - Breadcrumb navigation
- `input.tsx` - Input component
- `textarea.tsx` - Textarea component
- `select.tsx` - Select dropdown
- `checkbox.tsx` - Checkbox component
- `switch.tsx` - Toggle switch
- `slider.tsx` - Slider component
- `table.tsx` - Table component
- `form.tsx` - Form component with validation
- `avatar.tsx` - Avatar component
- `hover-card.tsx` - Hover card component
- `drawer.tsx` - Drawer/sheet component
- `sheet.tsx` - Sheet component
- `command.tsx` - Command palette
- `context-menu.tsx` - Context menu
- `navigation-menu.tsx` - Navigation menu
- `menubar.tsx` - Menu bar component
- `pagination.tsx` - Pagination component
- `progress.tsx` - Progress bar
- `toggle.tsx` - Toggle button
- `toggle-group.tsx` - Toggle button group
- `radio-group.tsx` - Radio button group
- `calendar.tsx` - Calendar component
- `input-otp.tsx` - OTP input
- `carousel.tsx` - Carousel component
- `chart.tsx` - Chart components
- `resizable.tsx` - Resizable panels
- `sonner.tsx` - Toast notifications
- `tooltip-docs.tsx` - Docs-specific tooltip
- `aspect-ratio.tsx` - Aspect ratio wrapper
- `alert-dialog.tsx` - Alert dialog

**Already Have (Skip):**
- `aside-link.tsx` ✓
- `button.tsx` ✓
- `collapsible.tsx` ✓
- `scroll-area.tsx` ✓

### 2. **Docs-Specific Components** (`components/docs/`)
Components specifically for documentation pages.

**Copy These:**
- `docs/ui/button.tsx` - Docs-specific button styles (check if different from ours)
- `docs/ui/popover.tsx` - Docs popover (check if different)
- `docs/ui/scroll-area.tsx` - Docs scroll area (check if different)
- `docs/ui/collapsible.tsx` - Docs collapsible (check if different)

**Already Implemented:**
- `docs/page.tsx` ✓
- `docs/page.client.tsx` ✓
- `docs/docs.tsx` ✓
- `docs/docs.client.tsx` ✓
- `docs/layout/nav.tsx` ✓
- `docs/layout/theme-toggle.tsx` ✓
- `docs/layout/toc.tsx` ✓
- `docs/layout/toc-thumb.tsx` ✓

### 3. **MDX Components** (`components/mdx/`)
Components for use in MDX files.

**Copy These:**
- `mdx/database-tables.tsx` - Database table display (compare with our database-table.tsx)
- `mdx/add-to-cursor.tsx` - Add to Cursor button (can adapt for Superset)

### 4. **Utility Components** (root level)
**Copy These:**
- `api-method.tsx` - API method display component
- `api-method-tabs.tsx` - Tabs for API methods
- `endpoint.tsx` - Endpoint display component
- `divider-text.tsx` - Text divider component
- `markdown-renderer.tsx` - Markdown rendering utility
- `markdown.tsx` - Markdown component
- `ripple.tsx` - Ripple animation effect
- `icons.tsx` - Icon collection
- `message-feedback.tsx` - Feedback component for messages
- `anchor-scroll-fix.tsx` - Fix for anchor scrolling
- `floating-ai-search.tsx` - Floating AI search trigger
- `search-dialog.tsx` - Search dialog component

**Already Have:**
- `mobile-search-icon.tsx` ✓
- `theme-toggle.tsx` ✓
- `theme-provider.tsx` ✓
- `nav-bar.tsx` ✓
- `nav-link.tsx` ✓
- `nav-mobile.tsx` ✓
- `side-bar.tsx` ✓
- `sidebar-content.tsx` ✓

### 5. **Resource Components** (root level)
**Copy These:**
- `resource-section.tsx` - Resource section wrapper
- `promo-card.tsx` - Promotional card component

**Already Have:**
- `resource-card.tsx` ✓
- `resource-grid.tsx` ✓

### 6. **Landing Page Components** (`components/landing/`)
**Copy These (Optional - for marketing site):**
- `landing/hero.tsx` - Hero section
- `landing/section.tsx` - Landing section wrapper
- `landing/section-svg.tsx` - SVG section decorations
- `landing/gradient-bg.tsx` - Gradient background
- `landing/grid-pattern.tsx` - Grid pattern background
- `landing/spotlight.tsx` - Spotlight effect
- `landing/testimonials.tsx` - Testimonials section

### 7. **Block Components** (`components/blocks/`)
**Copy These:**
- `blocks/features.tsx` - Features showcase block
- `features.tsx` - Features component (check if different from blocks/features.tsx)

---

## ❌ Components to Skip

### Better Auth Specific
- `builder/` - Entire folder (auth UI builder, specific to Better Auth)
- `christmas/logo.tsx` - Holiday-specific
- `halloween/logo.tsx` - Holiday-specific
- `logo.tsx` - Better Auth logo
- `logo-context-menu.tsx` - Better Auth branding
- `banner.tsx` - Likely Better Auth specific
- `fork-button.tsx` - GitHub fork button for Better Auth
- `generate-apple-jwt.tsx` - Apple JWT generator (auth-specific)
- `generate-secret.tsx` - Secret generator (auth-specific)
- `community-plugins-table.tsx` - Better Auth plugins
- `contributors.tsx` - Better Auth contributors
- `display-techstack.tsx` - Better Auth tech stack
- `techstack-icons.tsx` - Better Auth tech icons
- `github-stat.tsx` - GitHub stats for Better Auth
- `ai-chat-modal.tsx` - Their AI chat implementation (we have our own)

---

## 📁 Proposed Organization

```
apps/docs/src/components/
├── ui/                          # shadcn/ui and custom UI components
│   ├── (existing components)
│   ├── callout.tsx             # NEW
│   ├── code-block.tsx          # NEW
│   ├── dynamic-code-block.tsx  # NEW
│   ├── badge.tsx               # NEW
│   ├── card.tsx                # NEW
│   ├── tabs.tsx                # NEW
│   ├── (... all other UI components)
│   └── use-copy-button.tsx     # NEW
├── mdx/                         # NEW - MDX-specific components
│   └── database-tables.tsx
├── blocks/                      # NEW - Reusable content blocks
│   └── features.tsx
├── landing/                     # NEW - Landing page components (optional)
│   ├── hero.tsx
│   ├── section.tsx
│   └── (... other landing components)
├── docs/                        # Docs-specific (existing)
│   ├── (existing components)
│   └── ui/                      # Check for differences from main ui/
├── ai/                          # AI components (existing)
├── (other root-level components)
├── api-method.tsx              # NEW
├── endpoint.tsx                # NEW
├── divider-text.tsx            # NEW
└── (... other utility components)
```

---

## 🎯 Migration Strategy

### Phase 1: High-Value UI Components (Priority)
1. Callout, code-block, dynamic-code-block
2. Badge, card, tabs, tooltip
3. Dialog, popover, dropdown-menu
4. Alert, separator, fade-in

### Phase 2: API/Docs Components
1. api-method.tsx, api-method-tabs.tsx, endpoint.tsx
2. markdown-renderer.tsx, markdown.tsx
3. mdx/database-tables.tsx (compare with ours)

### Phase 3: Effects & Animations
1. ripple.tsx, sparkles.tsx
2. background-beams.tsx, background-boxes.tsx
3. floating-ai-search.tsx

### Phase 4: Forms & Input Components
1. Input, textarea, select, checkbox
2. Switch, slider, radio-group
3. Form, calendar, input-otp

### Phase 5: Advanced UI
1. Command, drawer, sheet
2. Navigation-menu, menubar, breadcrumb
3. Carousel, chart, resizable
4. Pagination, progress, toggle

### Phase 6: Landing (Optional - for marketing)
1. Hero, sections, gradients
2. Grid patterns, spotlight
3. Testimonials, features blocks

---

## 📋 Next Steps

1. **Review this plan** - Confirm which components are needed
2. **Start with Phase 1** - High-value components first
3. **Test each component** - Ensure they work in our setup
4. **Update imports** - Make sure all dependencies are resolved
5. **Document usage** - Add examples for each new component
6. **Remove duplicates** - If Better Auth version is better, replace ours

---

## 🔍 Notes

- Better Auth has **~55 UI components** in their ui/ folder
- We currently have **8 UI components**
- Their components use the same stack (shadcn/ui + Tailwind v4)
- Most components should work drop-in with minimal changes
- Focus on docs-useful components first (callout, code-block, etc.)
- Landing page components are optional (for apps/marketing)
