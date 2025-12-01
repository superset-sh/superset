# Brand Guidelines
---

## Fonts

### Font Families

| Name        | Font Family                                                           | Usage               |
| ----------- | --------------------------------------------------------------------- | ------------------- |
| Sans        | `"Matter Regular", "Matter Regular Placeholder", sans-serif`          | Body text, headings |
| Sans Medium | `"Matter Medium", "Matter Medium Placeholder", sans-serif`            | Buttons, emphasis   |
| Mono        | `"Matter Mono Regular", "Matter Mono Regular Placeholder", monospace` | Code, commands      |
| Mono Alt    | `"Geist Mono", monospace`                                             | Terminal UI         |

- `Inter` as sans-serif fallback
- `Geist Mono` for monospace

---

## Color Palette

### Background Colors

| Name              | Value                            | Tailwind Approx | Usage              |
| ----------------- | -------------------------------- | --------------- | ------------------ |
| Page Background   | `#1a1a1a` (warm dark)            | `neutral-900`   | Main background    |
| Button Dark       | `rgb(53, 53, 52)` / `#353534`    | `neutral-700`   | Terminal button bg |
| Card/Button Light | `rgb(249, 250, 245)` / `#f9f9f5` | `stone-50`      | Primary CTA bg     |
| Button Hover      | `rgb(238, 237, 234)` / `#eeeded` | `stone-200`     | Icon container     |
| Pressed State     | `rgb(64, 64, 63)` / `#40403f`    | `neutral-700`   | Button pressed     |

### Text Colors

| Name               | Value                            | Tailwind Approx | Usage                     |
| ------------------ | -------------------------------- | --------------- | ------------------------- |
| Primary White      | `rgb(255, 255, 255)`             | `white`         | Headings                  |
| Subtitle           | `rgba(250, 249, 246, 0.5)`       | `white/50`      | Subheadings, descriptions |
| Muted              | `rgb(175, 174, 172)` / `#afaeac` | `stone-400`     | Terminal text, icons      |
| Light Text         | `rgb(227, 226, 224)` / `#e3e2e0` | `stone-200`     | Code text                 |
| Button Dark Text   | `rgb(42, 43, 37)` / `#2a2b25`    | `neutral-800`   | Text on light buttons     |
| Button Light Text  | `rgba(0, 0, 0, 0.8)`             | `black/80`      | Active pill text          |
| Inactive Pill Text | `rgba(255, 255, 255, 0.8)`       | `white/80`      | Inactive selector text    |

### Border Colors

| Name            | Value                      | Usage                  |
| --------------- | -------------------------- | ---------------------- |
| Active Border   | `rgb(255, 255, 255)`       | Active selector pill   |
| Inactive Border | `rgba(255, 255, 255, 0.2)` | Inactive selector pill |
| Subtle Border   | `rgba(255, 255, 255, 0.1)` | Cards, dividers        |

---

## Typography

### Hero Heading (H1)

```css
font-family: "Matter Regular", sans-serif;
font-size: 45px;
letter-spacing: -0.03em;
line-height: 1em;
color: rgb(255, 255, 255);
```

**Tailwind**: `text-[45px] font-normal tracking-[-0.03em] leading-none text-white`

### Subtitle/Description

```css
font-family: "Matter Regular", sans-serif;
font-size: 20px;
letter-spacing: -0.03em;
color: rgba(250, 249, 246, 0.5);
```

**Tailwind**: `text-xl tracking-[-0.03em] text-white/50`

### Button Text

```css
font-family: "Matter Medium", sans-serif;
font-size: 16px;
letter-spacing: 0px;
line-height: 16px;
color: rgb(42, 43, 37);
```

**Tailwind**: `text-base font-medium leading-4 text-neutral-800`

### Code/Terminal Text

```css
font-family: "Matter Mono Regular", monospace;
/* or */ font-family: "Geist Mono", monospace;
font-size: 16px;
letter-spacing: -0.2px;
line-height: 1em;
color: rgb(227, 226, 224);
```

**Tailwind**: `font-mono text-base tracking-tight leading-none text-stone-200`

### Small Labels (Nav, Pills)

```css
font-family: "Matter Medium", sans-serif;
font-size: 12px;
font-weight: 500;
color: rgb(255, 255, 255);
```

**Tailwind**: `text-xs font-medium text-white`

### Selector Pill Text

```css
font-family: "Matter Regular", sans-serif;
font-size: 14px;
line-height: 140%;
color: rgba(0, 0, 0, 0.8); /* active */
color: rgba(255, 255, 255, 0.8); /* inactive */
```

---

## Border Radius

| Name      | Value            | Usage                             |
| --------- | ---------------- | --------------------------------- |
| Small     | `2px`            | Icon containers                   |
| Default   | `4px`            | Inner button elements             |
| Medium    | `5px`            | Buttons                           |
| Large     | `8px`            | Cards, videos, images             |
| Full/Pill | `40px` or `50px` | Pills, selectors, terminal button |

---

## Buttons

### Primary CTA Button ("Download for Mac")

```css
background-color: rgb(249, 250, 245); /* warm off-white */
border-radius: 5px;
padding: 4px 4px 4px 16px; /* asymmetric - more left padding */
```

Inner structure:
- Text: `"Matter Medium"`, 16px, `rgb(42, 43, 37)`
- Icon container: `rgb(238, 237, 234)`, 2px radius
- Has pressed/hover states

**Tailwind approximation**:
```tsx
className="bg-stone-50 text-neutral-800 rounded-[5px] pl-4 pr-1 py-1 font-medium hover:bg-stone-100"
```

### Terminal/Brew Button

```css
background-color: rgb(53, 53, 52);
border-radius: 50px;
padding: 10px;
font-family: "Geist Mono", monospace;
color: rgb(175, 174, 172);
```

**Tailwind**:
```tsx
className="bg-neutral-700 text-stone-400 rounded-full px-3 py-2.5 font-mono"
```

### Selector Pills

**Active state**:
```css
background-color: rgba(255, 255, 255, 0.8);
border: 1px solid rgb(255, 255, 255);
border-radius: 40px;
color: rgba(0, 0, 0, 0.8);
```

**Inactive state**:
```css
background-color: rgba(255, 255, 255, 0.01);
border: 1px solid rgba(255, 255, 255, 0.2);
border-radius: 40px;
color: rgba(255, 255, 255, 0.8);
```

---

## Layout

### Container
- Max width: `1600px`
- Horizontal padding: `30px` (each side, 60px total)

### Hero Section
- Two-column layout on desktop
- Left: ~42% (text content)
- Right: ~58% (product demo)

### Spacing
- Section padding: Large, generous whitespace
- Element gaps: `10-16px` typical

---

## Component Examples



### Selector Pill (Active)

```tsx
<button className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 border border-white rounded-full">
  <Icon className="w-3 h-4" />
  <span className="text-sm text-black/80">Build features</span>
</button>
```

### Selector Pill (Inactive)

```tsx
<button className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.01] border border-white/20 rounded-full">
  <span className="text-sm text-white/80">Fix bugs</span>
</button>
```

---

## Key Differences from Previous Guidelines

1. **Warmer tones**: Background is warm dark (`neutral-900`), not cold `zinc-950`
2. **Off-white buttons**: Primary CTA is `stone-50` (#f9f9f5), not pure white
3. **Custom font**: "Matter" family (we use Inter as fallback)
4. **Tight letter-spacing**: `-0.03em` on headings
5. **Asymmetric button padding**: Download button has more left padding
6. **Warm grays**: Use `stone-*` and `neutral-*`, not `zinc-*`
