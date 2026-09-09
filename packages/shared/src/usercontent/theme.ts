export const THEME_STYLESHEET_PATH = "/_superset/theme.css";

const LIGHT_TOKENS = `color-scheme: light;
	--sp-bg: oklch(1 0 0);
	--sp-surface: oklch(0.97 0 0);
	--sp-text: oklch(0.145 0 0);
	--sp-muted: oklch(0.556 0 0);
	--sp-border: oklch(0.922 0 0);
	--sp-accent: oklch(0.205 0 0);
	--sp-accent-text: oklch(0.985 0 0);
	--sp-code-bg: oklch(0.97 0 0);
	--sp-chart-1: oklch(0.646 0.222 41.116);
	--sp-chart-2: oklch(0.6 0.118 184.704);
	--sp-chart-3: oklch(0.398 0.07 227.392);
	--sp-chart-4: oklch(0.828 0.189 84.429);
	--sp-chart-5: oklch(0.769 0.188 70.08);`;

const DARK_TOKENS = `color-scheme: dark;
	--sp-bg: oklch(0.178 0 0);
	--sp-surface: oklch(0.205 0 0);
	--sp-text: oklch(0.985 0 0);
	--sp-muted: oklch(0.708 0 0);
	--sp-border: oklch(1 0 0 / 12%);
	--sp-accent: oklch(0.922 0 0);
	--sp-accent-text: oklch(0.205 0 0);
	--sp-code-bg: oklch(0.269 0 0);
	--sp-chart-1: oklch(0.488 0.243 264.376);
	--sp-chart-2: oklch(0.696 0.17 162.48);
	--sp-chart-3: oklch(0.769 0.188 70.08);
	--sp-chart-4: oklch(0.627 0.265 303.9);
	--sp-chart-5: oklch(0.645 0.246 16.439);`;

export const PAGE_THEME_CSS = `:where(:root),
:where(:root:has(> body.light)) {
	${LIGHT_TOKENS}
	--sp-radius: 0.625rem;
	--sp-measure: 72ch;
	--sp-font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
		"Helvetica Neue", Arial, sans-serif;
	--sp-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
		"Liberation Mono", monospace;
}

:where(:root:has(> body.dark)) {
	${DARK_TOKENS}
}

@media (prefers-color-scheme: dark) {
	:where(:root:has(> body.auto)) {
		${DARK_TOKENS}
	}
}

:where(*, *::before, *::after) {
	box-sizing: border-box;
}

:where(html) {
	background: var(--sp-bg);
	color: var(--sp-text);
}

:where(body) {
	margin: 0;
	font-family: var(--sp-font-sans);
	font-size: 16px;
	line-height: 1.6;
	-webkit-text-size-adjust: 100%;
	-webkit-font-smoothing: antialiased;
}

:where(h1, h2, h3, h4, h5, h6) {
	margin: 2em 0 0.6em;
	line-height: 1.25;
	font-weight: 650;
	letter-spacing: -0.011em;
	text-wrap: balance;
}

:where(h1) {
	margin-top: 0;
	font-size: 2rem;
	letter-spacing: -0.02em;
}
:where(h2) {
	font-size: 1.5rem;
}
:where(h3) {
	font-size: 1.175rem;
}
:where(h4, h5, h6) {
	font-size: 1rem;
}

:where(p, ul, ol, dl, blockquote) {
	margin: 0 0 1em;
}

:where(ul, ol) {
	padding-left: 1.35em;
}

:where(li) {
	margin-bottom: 0.35em;
}

:where(a) {
	color: var(--sp-accent);
	text-decoration-color: color-mix(in srgb, var(--sp-accent) 55%, transparent);
	text-underline-offset: 2px;
}

:where(strong, b) {
	font-weight: 650;
}

:where(small) {
	font-size: 0.85em;
	color: var(--sp-muted);
}

:where(hr) {
	margin: 2.5em 0;
	border: 0;
	border-top: 1px solid var(--sp-border);
}

:where(blockquote) {
	padding-left: 1em;
	border-left: 2px solid var(--sp-border);
	color: var(--sp-muted);
}

:where(code, kbd, samp) {
	font-family: var(--sp-font-mono);
	font-size: 0.9em;
}

:where(:not(pre) > code) {
	padding: 0.15em 0.35em;
	border-radius: 4px;
	background: var(--sp-code-bg);
}

:where(pre) {
	margin: 0 0 1.25em;
	padding: 1em;
	overflow-x: auto;
	border-radius: var(--sp-radius);
	background: var(--sp-code-bg);
	line-height: 1.5;
}

:where(pre code) {
	padding: 0;
	background: none;
}

:where(kbd) {
	padding: 0.1em 0.4em;
	border: 1px solid var(--sp-border);
	border-radius: 4px;
	background: var(--sp-surface);
}

:where(table) {
	max-width: 100%;
	margin: 0 0 1.5em;
	border-collapse: collapse;
	font-variant-numeric: tabular-nums;
}

:where(th, td) {
	padding: 0.5em 0.85em;
	border-bottom: 1px solid var(--sp-border);
	text-align: left;
	vertical-align: top;
}

:where(th) {
	font-weight: 600;
	color: var(--sp-muted);
	font-size: 0.85em;
	letter-spacing: 0.02em;
	text-transform: uppercase;
}

:where(tbody tr:last-child td) {
	border-bottom: 0;
}

:where(img, svg, video, canvas, iframe) {
	max-width: 100%;
}

:where(img, video) {
	height: auto;
}

:where(figure) {
	margin: 0 0 1.5em;
}

:where(figcaption) {
	margin-top: 0.5em;
	color: var(--sp-muted);
	font-size: 0.875em;
}

:where(details) {
	margin: 0 0 1em;
	padding: 0.75em 1em;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	background: var(--sp-surface);
}

:where(summary) {
	cursor: pointer;
	font-weight: 550;
}

:where(button, input, select, textarea) {
	font: inherit;
	color: inherit;
}

:where(::selection) {
	background: color-mix(in srgb, var(--sp-accent) 30%, transparent);
}
`;
