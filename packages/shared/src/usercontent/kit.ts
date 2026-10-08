/**
 * Components agents compose pages from, so a page needs little CSS of its
 * own. Every rule has zero specificity, like the base theme. Tone modifiers
 * (`.sp-ok` and the rest) win over a component's default tone only because
 * they come later in this sheet: keep them below every default.
 */
export const PAGE_KIT_CSS = String.raw`
:where(.sp-page) {
	max-width: calc(var(--sp-measure) + 3rem);
	margin: 0 auto;
	padding: clamp(2rem, 7vw, 4.5rem) 1.5rem 5rem;
}
:where(.sp-page.sp-wide) {
	max-width: 76rem;
}
:where(.sp-page) :where(h2) {
	margin: 3rem 0 1rem;
	font-size: 1.3125rem;
	font-weight: 600;
}
:where(.sp-header + * > h2:first-child) {
	margin-top: 0;
}
:where(.sp-scroll) {
	overflow-x: auto;
	margin: 0 0 var(--sp-space);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
}
:where(.sp-scroll > table) {
	width: 100%;
	max-width: none;
	margin: 0;
}
:where(.sp-scroll th) {
	background: var(--sp-surface);
}
:where(.sp-scroll) :where(th, td) {
	padding: 0.6rem 1rem;
	vertical-align: middle;
}

:where(.sp-badge, .sp-finding, .sp-side, .sp-files li, .sp-checklist li, .sp-steps li) {
	--sp-tone: var(--sp-muted);
}
:where(.sp-callout, .sp-stat) {
	--sp-tone: var(--sp-text);
}
:where(.sp-bar) {
	--sp-tone: var(--sp-accent);
}
:where(.sp-ok, .sp-added, .sp-done) {
	--sp-tone: var(--sp-ok);
}
:where(.sp-warn, .sp-modified, .sp-partial) {
	--sp-tone: var(--sp-warn);
}
:where(.sp-bad, .sp-removed, .sp-blocked) {
	--sp-tone: var(--sp-bad);
}
:where(.sp-info, .sp-renamed) {
	--sp-tone: var(--sp-info);
}

:where([class*="sp-"]) {
	--sp-ink: color-mix(in oklab, var(--sp-tone) 85%, var(--sp-text));
}
:where(.sp-callout, .sp-card, .sp-finding, .sp-option, .sp-steps p, .sp-scroll > table) {
	font-size: 0.9375rem;
}
:where(.sp-callout, .sp-card, .sp-finding, .sp-steps > li, .sp-vote) > :where(:last-child) {
	margin-bottom: 0;
}
:where(.sp-card, .sp-callout, .sp-finding, .sp-vote) > :where(:first-child) {
	margin-top: 0;
}
:where(.sp-meta, .sp-bars) > :where(*) {
	margin: 0;
}
:where(.sp-kicker, .sp-side > figcaption, .sp-side-label) {
	margin: 0 0 0.75rem;
	font: 500 0.75rem/1.4 var(--sp-font-mono);
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--sp-tone, var(--sp-muted));
}

:where(.sp-header) {
	margin: 0 0 2.5rem;
	padding-bottom: 1.75rem;
	border-bottom: 1px solid var(--sp-border);
}
:where(.sp-header h1) {
	margin: 0 0 0.75rem;
	font-size: clamp(2rem, 5vw, 2.625rem);
	font-weight: 650;
	line-height: 1.1;
	letter-spacing: -0.03em;
}
:where(.sp-lede) {
	font-size: 1.125rem;
	line-height: 1.55;
	color: color-mix(in oklab, var(--sp-text) 72%, var(--sp-bg));
}
:where(.sp-header > .sp-meta) {
	margin-top: 1.5rem;
}
:where(.sp-meta) {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem 1.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 0.8125rem;
	color: var(--sp-muted);
}
:where(.sp-meta code) {
	padding: 0;
	background: none;
	color: var(--sp-text);
	font-size: 0.95em;
}

:where(.sp-badge) {
	display: inline-block;
	padding: 0 0.45em;
	border: 1px solid color-mix(in oklab, var(--sp-tone) 28%, transparent);
	border-radius: 5px;
	background: color-mix(in oklab, var(--sp-tone) 10%, transparent);
	color: var(--sp-ink);
	font: 550 0.75rem/1.55 var(--sp-font-sans);
	white-space: nowrap;
	vertical-align: 0.1em;
}

:where(.sp-stats) {
	display: flex;
	flex-wrap: wrap;
	margin: 0 0 var(--sp-space);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	overflow: hidden;
}
:where(.sp-stat) {
	display: flex;
	flex-direction: column;
	flex: 1 1 9.5rem;
	padding: 1rem 1.25rem 1.1rem;
	box-shadow: 1px 0 0 var(--sp-border), 0 1px 0 var(--sp-border);
}
:where(.sp-stat-value) {
	color: var(--sp-ink);
	font-size: 1.875rem;
	font-weight: 600;
	line-height: 1.15;
	letter-spacing: -0.025em;
	font-variant-numeric: tabular-nums;
}
:where(.sp-stat-label) {
	order: -1;
	margin-bottom: 0.4rem;
	font-size: 0.8125rem;
	line-height: 1.35;
	color: var(--sp-muted);
}
:where(.sp-stat-delta) {
	margin-top: 0.35rem;
	font: 0.75rem var(--sp-font-mono);
	color: var(--sp-muted);
}

:where(.sp-callout) {
	margin: 0 0 var(--sp-space);
	padding: 0.875rem 1.125rem;
	border: 1px solid color-mix(in oklab, var(--sp-tone) 22%, var(--sp-border));
	border-radius: var(--sp-radius);
	background: color-mix(in oklab, var(--sp-tone) 5%, var(--sp-bg));
}
:where(.sp-callout-title) {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 0.2rem;
	font-weight: 600;
	color: var(--sp-ink);
}
:where(.sp-callout-title, .sp-finding-head, .sp-side > figcaption)::before {
	content: "";
	flex: none;
	display: inline-block;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 50%;
	background: var(--sp-tone);
}

:where(.sp-grid, .sp-compare) {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--sp-min, 16rem)), 1fr));
	gap: 1rem;
	margin: 0 0 var(--sp-space);
}
:where(.sp-card) {
	padding: 1.125rem 1.25rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
}
:where(.sp-card) > :where(h3, h4) {
	font-size: 1rem;
	margin-bottom: 0.5rem;
}

:where(.sp-compare) {
	--sp-min: 18rem;
}
:where(.sp-side) {
	margin: 0;
	min-width: 0;
}
:where(.sp-side > figcaption)::before {
	margin-right: 0.5rem;
}
:where(.sp-shot) {
	display: block;
	width: 100%;
	margin: 0;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	overflow: hidden;
	background: var(--sp-surface);
}
:where(.sp-shot > img, .sp-shot > video) {
	display: block;
	width: 100%;
}

:where(.sp-finding) {
	margin: 0 0 1rem;
	padding: 1.125rem 1.25rem 1.25rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
}
:where(.sp-finding-head) {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4rem 0.6rem;
	margin: 0 0 0.75rem;
}
:where(.sp-finding > .sp-finding-head:first-child) {
	margin: -1.125rem -1.25rem 1rem;
	padding: 0.7rem 1.25rem;
	border-bottom: 1px solid var(--sp-border);
	border-radius: calc(var(--sp-radius) - 1px) calc(var(--sp-radius) - 1px) 0 0;
	background: var(--sp-surface);
}
:where(.sp-finding-head > :is(h2, h3, h4)) {
	flex: 1 1 14rem;
	margin: 0;
	font-size: 1rem;
	line-height: 1.4;
}
:where(.sp-finding-num) {
	font: 500 0.8125rem var(--sp-font-mono);
	color: var(--sp-muted);
}
:where(.sp-where) {
	margin: 0 0 0.6rem;
	font: 0.8125rem/1.5 var(--sp-font-mono);
	color: var(--sp-muted);
	overflow-wrap: anywhere;
}
:where(.sp-fix) {
	margin: 0.875rem 0 0;
	padding: 0.625rem 0.875rem;
	border-radius: calc(var(--sp-radius) - 2px);
	background: color-mix(in oklab, var(--sp-ok) 7%, var(--sp-bg));
}
:where(.sp-fix > strong:first-child) {
	margin-right: 0.35rem;
	color: color-mix(in oklab, var(--sp-ok) 85%, var(--sp-text));
}

:where(.sp-steps) {
	margin: 0 0 var(--sp-space);
	padding: 0;
	list-style: none;
	counter-reset: sp-step;
}
:where(.sp-steps > li) {
	counter-increment: sp-step;
	position: relative;
	margin: 0;
	padding: 0 0 1.5rem 2.5rem;
}
:where(.sp-steps > li)::before {
	content: counter(sp-step);
	position: absolute;
	left: 0;
	top: 0.05rem;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	border: 1px solid color-mix(in oklab, var(--sp-tone) 45%, var(--sp-border));
	border-radius: 50%;
	background: color-mix(in oklab, var(--sp-tone) 12%, var(--sp-bg));
	color: var(--sp-ink, var(--sp-muted));
	font: 600 0.75rem/1 var(--sp-font-mono);
}
:where(.sp-steps > li:last-child) {
	padding-bottom: 0;
}
:where(.sp-steps > li:not(:last-child))::after {
	content: "";
	position: absolute;
	left: calc(0.75rem - 0.5px);
	top: 1.75rem;
	bottom: 0.25rem;
	border-left: 1px solid var(--sp-border);
}
:where(.sp-steps > li > small) {
	margin-left: 0.4rem;
	font: 0.8125rem var(--sp-font-mono);
}
:where(.sp-steps > li > p) {
	margin: 0.2rem 0 0;
	color: color-mix(in oklab, var(--sp-text) 75%, var(--sp-bg));
}

:where(.sp-files) {
	margin: 0 0 var(--sp-space);
	padding: 0;
	list-style: none;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	font: 0.8125rem/1.45 var(--sp-font-mono);
}
:where(.sp-files > li) {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin: 0;
	padding: 0.55rem 0.875rem;
}
:where(.sp-files > li + li) {
	border-top: 1px solid var(--sp-border);
}
:where(.sp-files > li)::before {
	content: "\b7";
	flex: none;
	display: grid;
	place-items: center;
	width: 1.25rem;
	height: 1.25rem;
	border-radius: 4px;
	background: color-mix(in oklab, var(--sp-tone) 13%, transparent);
	color: var(--sp-ink, var(--sp-muted));
	font-size: 0.6875rem;
	font-weight: 700;
}
:where(.sp-files > .sp-added)::before {
	content: "A";
}
:where(.sp-files > .sp-modified)::before {
	content: "M";
}
:where(.sp-files > .sp-removed)::before {
	content: "D";
}
:where(.sp-files > .sp-renamed)::before {
	content: "R";
}
:where(.sp-files code) {
	flex: 1;
	min-width: 0;
	padding: 0;
	background: none;
	font-size: 1em;
	overflow-wrap: anywhere;
}
:where(.sp-files > .sp-removed > code) {
	text-decoration: line-through;
	color: var(--sp-muted);
}
:where(.sp-files > li > small, .sp-diffstat) {
	margin-left: auto;
	white-space: nowrap;
}
:where(.sp-diffstat, .sp-diff) :where(ins, del) {
	text-decoration: none;
}
:where(.sp-diffstat ins) {
	color: var(--sp-ok);
}
:where(.sp-diffstat del) {
	color: var(--sp-bad);
}

:where(.sp-code) {
	margin: 0 0 var(--sp-space);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	overflow: hidden;
}
:where(.sp-code > figcaption) {
	margin: 0;
	padding: 0.5rem 1rem;
	border-bottom: 1px solid var(--sp-border);
	background: var(--sp-surface);
	font: 0.75rem var(--sp-font-mono);
	color: var(--sp-muted);
}
:where(.sp-code > pre) {
	margin: 0;
	padding: 0.75rem 1rem;
	border-radius: 0;
	background: none;
	font-size: 0.875rem;
	line-height: 1.7;
}
:where(.sp-diff > code) {
	display: inline-block;
	min-width: 100%;
}
:where(.sp-diff) :where(ins, del) {
	position: relative;
	display: inline-block;
	width: calc(100% + 2rem);
	margin: 0 -1rem;
	padding: 0 1rem;
	background: color-mix(in oklab, var(--sp-ok) 13%, transparent);
}
:where(.sp-diff del) {
	background: color-mix(in oklab, var(--sp-bad) 13%, transparent);
}
:where(.sp-diff) :where(ins, del)::before {
	content: "+";
	position: absolute;
	left: 0.35rem;
	color: var(--sp-ok);
}
:where(.sp-diff del)::before {
	content: "-";
	color: var(--sp-bad);
}

:where(.sp-bars) {
	display: grid;
	grid-template-columns: minmax(5rem, max-content) 1fr auto;
	align-items: center;
	gap: 0.6rem 1rem;
	margin: 0 0 var(--sp-space);
	font-size: 0.875rem;
}
:where(.sp-bars > :nth-child(3n)) {
	font: 0.8125rem var(--sp-font-mono);
	color: var(--sp-muted);
}
:where(.sp-bar) {
	display: block;
	height: 0.375rem;
	border-radius: 2px;
	background:
		linear-gradient(var(--sp-tone) 0 0) 0 / var(--sp-value, 0%) 100% no-repeat,
		var(--sp-code-bg);
}

:where(.sp-vote) {
	margin: 0 0 var(--sp-space);
	padding: 1.125rem 1.25rem 1.25rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
}
:where(.sp-vote) > :where(h3, h4) {
	margin-bottom: 0.875rem;
	font-size: 1rem;
}
:where(.sp-option) {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
	gap: 0.5rem 1rem;
	width: 100%;
	margin: 0 0 0.5rem;
	padding: 0.7rem 0.9rem 0.8rem;
	border: 1px solid var(--sp-border);
	border-radius: calc(var(--sp-radius) - 2px);
	background: var(--sp-bg);
	font-weight: 500;
	text-align: left;
	cursor: pointer;
}
:where(.sp-option, .sp-button):where(:not(:disabled):hover) {
	border-color: color-mix(in oklab, var(--sp-text) 25%, var(--sp-border));
	background: var(--sp-surface);
}
:where(.sp-option:disabled) {
	cursor: default;
}
:where(.sp-option[aria-pressed="true"], .sp-button[aria-pressed="true"]) {
	border-color: var(--sp-accent);
	box-shadow: inset 0 0 0 1px var(--sp-accent);
	background: var(--sp-surface);
}
:where(.sp-option > .sp-bar) {
	grid-column: 1 / -1;
	height: 0.25rem;
}
:where(.sp-option-count) {
	font: 400 0.8125rem var(--sp-font-mono);
	font-variant-numeric: tabular-nums;
	color: var(--sp-muted);
}
:where(.sp-vote.sp-inline) {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	margin: 1rem 0 0;
	padding: 0;
	border: 0;
}
:where(.sp-vote.sp-inline > .sp-option) {
	display: inline-flex;
	gap: 0.5rem;
	width: auto;
	margin: 0;
	padding: 0.25rem 0.7rem;
	font-size: 0.8125rem;
}
:where(.sp-vote.sp-inline > .sp-option > .sp-option-count) {
	padding-left: 0.5rem;
	border-left: 1px solid var(--sp-border);
	font-size: 0.75rem;
}
:where(.sp-vote.sp-inline .sp-bar) {
	display: none;
}
:where(.sp-vote-status) {
	margin: 0.75rem 0 0;
	font-size: 0.8125rem;
	color: var(--sp-muted);
}
:where(.sp-vote.sp-inline > .sp-vote-status) {
	flex-basis: 100%;
	margin: 0;
}
:where(.sp-vote-status:empty) {
	display: none;
}
:where(.sp-button) {
	padding: 0.25rem 0.75rem;
	border: 1px solid var(--sp-border);
	border-radius: calc(var(--sp-radius) - 4px);
	background: var(--sp-bg);
	font-size: 0.8125rem;
	font-weight: 500;
	line-height: 1.5;
	cursor: pointer;
}
:where(.sp-button:disabled) {
	cursor: default;
}

:where(.sp-checklist) {
	margin: 0 0 var(--sp-space);
	padding: 0;
	list-style: none;
}
:where(.sp-checklist > li) {
	position: relative;
	margin-bottom: 0.5rem;
	padding-left: 1.75rem;
}
:where(.sp-checklist > li)::before {
	content: "";
	position: absolute;
	left: 0;
	top: 0.25em;
	display: grid;
	place-items: center;
	width: 1.05em;
	height: 1.05em;
	border: 1.5px solid color-mix(in oklab, var(--sp-tone) 70%, var(--sp-border));
	border-radius: 4px;
	color: var(--sp-tone);
	font: 700 0.75em/1 var(--sp-font-sans);
}
:where(.sp-checklist > .sp-done)::before {
	content: "\2713";
	border-color: var(--sp-tone);
	background: var(--sp-tone);
	color: var(--sp-bg);
}
:where(.sp-checklist > .sp-partial)::before {
	background: linear-gradient(var(--sp-tone) 0 0) center / 50% 2px no-repeat;
}
:where(.sp-checklist > .sp-blocked)::before {
	content: "\d7";
}
`;
