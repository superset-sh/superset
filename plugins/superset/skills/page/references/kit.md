# Page kit

Every published page gets these classes for free: the origin injects them with
the theme, so a page links nothing and inlines nothing to use them. Build the
page from them first and write CSS only for what is unique to this page.

Every rule has zero specificity, so any selector you write wins. Every colour
comes from a token, so light and dark both work without extra CSS.

## Tones

Add one tone class to any component that carries status:

| Class | Means | Aliases |
| --- | --- | --- |
| `sp-ok` | passed, shipped, safe | `sp-added`, `sp-done` |
| `sp-warn` | partial, risky, needs a look | `sp-modified`, `sp-partial` |
| `sp-bad` | failed, broken, blocked | `sp-removed`, `sp-blocked` |
| `sp-info` | neutral fact, note | `sp-renamed` |

The tokens behind them are `--sp-ok`, `--sp-warn`, `--sp-bad` and `--sp-info`.
Use those for status in your own CSS too. Never use `--sp-chart-*` for status:
the chart colours change hue between themes.

## Layout

```html
<body class="auto">
  <main class="sp-page">...</main>        <!-- reading width, padded -->
  <main class="sp-page sp-wide">...</main> <!-- for tables and dashboards -->
</body>
```

Wrap any table that can grow wider than the page. The wrapper also frames the
table in a bordered panel with a shaded header row:

```html
<div class="sp-scroll"><table>...</table></div>
```

## Header

```html
<header class="sp-header">
  <p class="sp-kicker">PR #8326 walkthrough <span class="sp-badge sp-ok">Merged</span></p>
  <h1>Move conflicts report as 409</h1>
  <p class="sp-lede">A taken destination now returns a conflict the client can show, not a 500.</p>
  <ul class="sp-meta">
    <li>branch <code>fix-move-conflict</code></li>
    <li>3 files, +48 / -12</li>
    <li>8 Oct 2026</li>
  </ul>
</header>
```

## Badge

```html
<span class="sp-badge sp-ok">Verified</span>
<span class="sp-badge sp-bad">High</span>
<span class="sp-badge">Draft</span>
```

## Stats

```html
<div class="sp-stats">
  <div class="sp-stat sp-ok">
    <span class="sp-stat-value">17 ms</span>
    <span class="sp-stat-label">median frame</span>
    <span class="sp-stat-delta">was 51 ms</span>
  </div>
</div>
```

Use stats only when the numbers are the point of the page.

## Callout

```html
<div class="sp-callout sp-warn">
  <strong class="sp-callout-title">Not done yet</strong>
  <p>Mobile still shows the old error string.</p>
</div>
```

## Card and grid

```html
<div class="sp-grid" style="--sp-min: 20rem">
  <section class="sp-card"><h3>Option A</h3><p>...</p></section>
  <section class="sp-card"><h3>Option B</h3><p>...</p></section>
</div>
```

## Before and after

```html
<div class="sp-compare">
  <figure class="sp-side sp-bad">
    <figcaption>Before</figcaption>
    <img class="sp-shot" src="data:image/png;base64,..." alt="Error toast with a stack trace" />
  </figure>
  <figure class="sp-side sp-ok">
    <figcaption>After</figcaption>
    <img class="sp-shot" src="after.png" alt="Inline conflict message" />
  </figure>
</div>
```

Capture both sides at the same width. `sp-shot` also wraps a `<video>`.

## Finding

```html
<article class="sp-finding sp-bad">
  <div class="sp-finding-head">
    <span class="sp-finding-num">01</span>
    <h3>Retry loop never gives up</h3>
    <span class="sp-badge sp-bad">High</span>
    <span class="sp-badge sp-ok">Verified</span>
  </div>
  <p class="sp-where">packages/host-service/src/sync.ts:142</p>
  <p>What breaks, as a concrete scenario.</p>
  <p class="sp-fix"><strong>Fix</strong> Cap retries at 5 and surface the error.</p>
</article>
```

## Steps and timeline

```html
<ol class="sp-steps">
  <li class="sp-done"><strong>Reproduce</strong> <small>09:12</small><p>...</p></li>
  <li class="sp-blocked"><strong>Deploy</strong><p>...</p></li>
  <li><strong>Verify</strong><p>...</p></li>
</ol>
```

## Changed files

```html
<ul class="sp-files">
  <li class="sp-added"><code>src/conflict.ts</code><span class="sp-diffstat"><ins>+40</ins></span></li>
  <li class="sp-modified"><code>src/move.ts</code><span class="sp-diffstat"><ins>+8</ins> <del>-12</del></span></li>
  <li class="sp-removed"><code>src/legacy.ts</code></li>
</ul>
```

List files in the order a reviewer should read them, not alphabetically.

## Code and diff

```html
<figure class="sp-code">
  <figcaption>src/move.ts</figcaption>
  <pre class="sp-diff"><code>  const target = resolve(dest);
<del>  if (exists(target)) throw new Error("taken");</del>
<ins>  if (exists(target)) return conflict(target);</ins></code></pre>
</figure>
```

## Bars

```html
<div class="sp-bars">
  <span>p50</span><span class="sp-bar sp-ok" style="--sp-value: 34%"></span><span>17 ms</span>
  <span>p95</span><span class="sp-bar sp-warn" style="--sp-value: 80%"></span><span>40 ms</span>
</div>
```

For a real chart, draw inline SVG with `--sp-chart-1` to `--sp-chart-5`.

## Checklist

```html
<ul class="sp-checklist">
  <li class="sp-done">Typecheck</li>
  <li class="sp-partial">Mobile build</li>
  <li class="sp-blocked">Release notes</li>
  <li>Changelog</li>
</ul>
```

## Vote, claim and button

These need the script in `references/storage.md`. Markup:

```html
<section class="sp-vote" data-key="decision:storage-engine" data-author="AUTHOR_USER_ID">
  <h3>Which storage engine?</h3>
  <button type="button" class="sp-option" data-value="sqlite">
    <span>SQLite per host</span><span class="sp-option-count"></span><span class="sp-bar"></span>
  </button>
  <button type="button" class="sp-option" data-value="postgres">
    <span>Shared Postgres</span><span class="sp-option-count"></span><span class="sp-bar"></span>
  </button>
  <button type="button" class="sp-button sp-vote-close" hidden>Close with my vote</button>
  <p class="sp-vote-status"></p>
</section>

<button type="button" class="sp-button sp-claim" data-key="claim:action-1"></button>
```

`sp-button` is the plain button for any other control.

## Tokens

| Token | What it is |
| --- | --- |
| `--sp-bg` | Page background |
| `--sp-surface` | Raised or inset panels |
| `--sp-text` | Body text |
| `--sp-muted` | Secondary text, captions, table headers |
| `--sp-border` | Rules and hairlines |
| `--sp-accent` / `--sp-accent-text` | Links and emphasis, and text on top of the accent |
| `--sp-ok` / `--sp-warn` / `--sp-bad` / `--sp-info` | Status colours, readable in both themes |
| `--sp-code-bg` | Code background: a translucent tint, so it sits on any background |
| `--sp-chart-1` to `--sp-chart-5` | Categorical series colours, distinct in both themes |
| `--sp-radius` | Corner radius |
| `--sp-space` | Gap below each kit component |
| `--sp-measure` | Reading measure for prose blocks |
| `--sp-font-sans` / `--sp-font-mono` | Font stacks |

The accent is a near-neutral, the way the app's is: it carries emphasis
through weight and underline rather than hue.

To adjust a token, redefine it on `:root`, never on `body`. The theme's own
values live on `:root`, and a value set closer to the content wins in only one
of the two colour schemes. Changing the palette is almost never right: a page
that looks like Superset reads as part of the team's work.
