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
	padding: clamp(1.25rem, 4vw, 3rem) 1.5rem 4rem;
}
:where(.sp-page.sp-wide) {
	max-width: 76rem;
}
:where(.sp-scroll) {
	overflow-x: auto;
	margin: 0 0 1.5em;
}
:where(.sp-scroll > table) {
	min-width: 100%;
	max-width: none;
}

:where(.sp-badge, .sp-finding, .sp-side, .sp-files li, .sp-checklist li) {
	--sp-tone: var(--sp-muted);
}
:where(.sp-callout, .sp-stat, .sp-steps li) {
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

:where(.sp-callout, .sp-card, .sp-finding, .sp-steps > li, .sp-vote, .sp-scroll) > :where(:last-child) {
	margin-bottom: 0;
}
:where(.sp-meta, .sp-bars) > :where(*) {
	margin: 0;
}
:where(.sp-kicker, .sp-side > figcaption, .sp-side-label) {
	margin: 0 0 0.5rem;
	font: 600 0.75rem/1.4 var(--sp-font-mono);
	letter-spacing: 0.07em;
	text-transform: uppercase;
	color: var(--sp-tone, var(--sp-muted));
}

:where(.sp-header) {
	margin: 0 0 2.5rem;
}
:where(.sp-header h1) {
	margin: 0 0 0.4em;
	font-size: clamp(1.75rem, 4.5vw, 2.5rem);
}
:where(.sp-lede) {
	font-size: 1.175rem;
	line-height: 1.5;
	color: color-mix(in oklab, var(--sp-text) 80%, var(--sp-bg));
}
:where(.sp-meta) {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 1rem;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 0.85rem;
	color: var(--sp-muted);
}

:where(.sp-badge) {
	display: inline-block;
	padding: 0 0.5em;
	border: 1px solid color-mix(in oklab, var(--sp-tone) 35%, transparent);
	border-radius: 4px;
	background: color-mix(in oklab, var(--sp-tone) 10%, transparent);
	color: var(--sp-tone);
	font: 600 0.75rem/1.6 var(--sp-font-sans);
	white-space: nowrap;
	vertical-align: 0.1em;
}

:where(.sp-stats) {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
	margin: 0 0 2rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	overflow: hidden;
}
:where(.sp-stat) {
	padding: 1rem 1.1rem;
	box-shadow: 1px 0 0 var(--sp-border), 0 1px 0 var(--sp-border);
}
:where(.sp-stat-value) {
	display: block;
	color: var(--sp-tone);
	font-size: 1.75rem;
	font-weight: 650;
	line-height: 1.1;
	letter-spacing: -0.02em;
	font-variant-numeric: tabular-nums;
}
:where(.sp-stat-label, .sp-stat-delta) {
	display: block;
	margin-top: 0.3rem;
	font-size: 0.85rem;
	line-height: 1.35;
	color: var(--sp-muted);
}
:where(.sp-stat-delta) {
	font: 0.75rem var(--sp-font-mono);
}

:where(.sp-callout) {
	margin: 0 0 1.5em;
	padding: 0.85em 1.1em;
	border-left: 3px solid var(--sp-tone);
	border-radius: 0 var(--sp-radius) var(--sp-radius) 0;
	background: color-mix(in oklab, var(--sp-tone) 7%, transparent);
}
:where(.sp-callout-title) {
	display: block;
	margin-bottom: 0.25em;
	font-weight: 650;
	color: var(--sp-tone);
}

:where(.sp-grid, .sp-compare) {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--sp-min, 16rem)), 1fr));
	gap: 1rem;
	margin: 0 0 1.5em;
}
:where(.sp-card) {
	padding: 1rem 1.15rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	background: var(--sp-surface);
}
:where(.sp-card, .sp-callout, .sp-finding, .sp-vote) > :where(:first-child) {
	margin-top: 0;
}

:where(.sp-compare) {
	--sp-min: 18rem;
}
:where(.sp-side) {
	margin: 0;
	min-width: 0;
}
:where(.sp-side > figcaption)::before {
	content: "";
	display: inline-block;
	width: 0.55em;
	height: 0.55em;
	margin-right: 0.5em;
	border-radius: 50%;
	background: var(--sp-tone);
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
	margin: 0 0 1.25rem;
	padding: 1rem 1.15rem;
	border: 1px solid var(--sp-border);
	border-left: 3px solid var(--sp-tone);
	border-radius: var(--sp-radius);
}
:where(.sp-finding-head) {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.4rem 0.6rem;
	margin: 0 0 0.5rem;
}
:where(.sp-finding-head > :is(h2, h3, h4)) {
	flex: 1 1 16rem;
	margin: 0;
	font-size: 1.05rem;
}
:where(.sp-finding-num) {
	font: 600 0.8rem var(--sp-font-mono);
	color: var(--sp-muted);
}
:where(.sp-where) {
	margin: 0 0 0.6rem;
	font: 0.8rem/1.5 var(--sp-font-mono);
	color: var(--sp-muted);
	overflow-wrap: anywhere;
}
:where(.sp-fix) {
	margin: 0.75rem 0 0;
	padding-top: 0.6rem;
	border-top: 1px dashed var(--sp-border);
}
:where(.sp-fix > strong:first-child) {
	color: var(--sp-ok);
}

:where(.sp-steps) {
	counter-reset: sp-step;
	margin: 0 0 1.5em;
	padding: 0;
	list-style: none;
}
:where(.sp-steps > li) {
	counter-increment: sp-step;
	position: relative;
	margin: 0;
	padding: 0 0 1.25rem 2.5rem;
}
:where(.sp-steps > li)::before {
	content: counter(sp-step);
	position: absolute;
	left: 0;
	top: 0;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	border: 1px solid var(--sp-border);
	border-radius: 50%;
	background: var(--sp-bg);
	font: 600 0.8rem/1 var(--sp-font-mono);
}
:where(.sp-steps > li:not(:last-child))::after {
	content: "";
	position: absolute;
	left: 0.85rem;
	top: 1.75rem;
	bottom: 0;
	border-left: 1px solid var(--sp-border);
}
:where(.sp-steps > li:is(.sp-done, .sp-ok, .sp-warn, .sp-bad, .sp-blocked, .sp-partial, .sp-info))::before {
	border-color: var(--sp-tone);
	background: var(--sp-tone);
	color: var(--sp-bg);
}

:where(.sp-files) {
	margin: 0 0 1.5em;
	padding: 0;
	list-style: none;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	font: 0.85rem/1.4 var(--sp-font-mono);
}
:where(.sp-files > li) {
	display: flex;
	align-items: baseline;
	gap: 0.75rem;
	margin: 0;
	padding: 0.45rem 0.8rem;
}
:where(.sp-files > li + li) {
	border-top: 1px solid var(--sp-border);
}
:where(.sp-files > li)::before {
	content: "\b7";
	flex: 0 0 1ch;
	font-weight: 700;
	color: var(--sp-tone);
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
	padding: 0;
	background: none;
	font-size: 1em;
	overflow-wrap: anywhere;
}
:where(.sp-files > .sp-removed > code) {
	text-decoration: line-through;
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
	margin: 0 0 1.25em;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
	overflow: hidden;
}
:where(.sp-code > figcaption) {
	margin: 0;
	padding: 0.4rem 0.9rem;
	border-bottom: 1px solid var(--sp-border);
	background: var(--sp-surface);
	font: 0.75rem var(--sp-font-mono);
	color: var(--sp-muted);
}
:where(.sp-code > pre) {
	margin: 0;
	border-radius: 0;
}
:where(.sp-diff) :where(ins, del) {
	display: inline-block;
	width: calc(100% + 2em);
	margin: 0 -1em;
	padding: 0 1em;
	background: color-mix(in oklab, var(--sp-ok) 14%, transparent);
}
:where(.sp-diff del) {
	background: color-mix(in oklab, var(--sp-bad) 14%, transparent);
}

:where(.sp-bars) {
	display: grid;
	grid-template-columns: minmax(6rem, max-content) 1fr auto;
	align-items: center;
	gap: 0.5rem 0.9rem;
	margin: 0 0 1.5em;
	font-size: 0.9rem;
}
:where(.sp-bars > :nth-child(3n)) {
	font-variant-numeric: tabular-nums;
	color: var(--sp-muted);
}
:where(.sp-bar) {
	display: block;
	height: 0.55rem;
	border-radius: 999px;
	background:
		linear-gradient(var(--sp-tone) 0 0) 0 / var(--sp-value, 0%) 100% no-repeat,
		var(--sp-code-bg);
}

:where(.sp-vote) {
	margin: 0 0 1.5em;
	padding: 1rem;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius);
}
:where(.sp-option) {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.35rem 1rem;
	width: 100%;
	margin: 0 0 0.5rem;
	padding: 0.65rem 0.85rem;
	border: 1px solid var(--sp-border);
	border-radius: calc(var(--sp-radius) - 2px);
	background: none;
	text-align: left;
	cursor: pointer;
}
:where(.sp-option:hover) {
	background: var(--sp-surface);
}
:where(.sp-option:disabled) {
	cursor: default;
}
:where(.sp-option[aria-pressed="true"]) {
	border-color: var(--sp-accent);
	box-shadow: inset 0 0 0 1px var(--sp-accent);
}
:where(.sp-option > .sp-bar) {
	grid-column: 1 / -1;
}
:where(.sp-option-count) {
	font-variant-numeric: tabular-nums;
	color: var(--sp-muted);
}
:where(.sp-vote.sp-inline) {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	margin: 0.75rem 0 0;
	padding: 0;
	border: 0;
}
:where(.sp-vote.sp-inline > .sp-option) {
	display: inline-flex;
	gap: 0.5rem;
	width: auto;
	margin: 0;
	padding: 0.2rem 0.7rem;
	font-size: 0.85rem;
}
:where(.sp-vote.sp-inline .sp-bar) {
	display: none;
}
:where(.sp-vote.sp-inline > .sp-vote-status) {
	flex-basis: 100%;
	margin: 0;
}
:where(.sp-vote-status) {
	margin: 0.5rem 0 0;
	font-size: 0.85rem;
	color: var(--sp-muted);
}
:where(.sp-button) {
	padding: 0.2rem 0.7rem;
	border: 1px solid var(--sp-border);
	border-radius: calc(var(--sp-radius) - 4px);
	background: var(--sp-bg);
	font-size: 0.85rem;
	cursor: pointer;
}
:where(.sp-button:hover) {
	background: var(--sp-surface);
}
:where(.sp-button:disabled) {
	cursor: default;
	opacity: 0.7;
}
:where(.sp-button[aria-pressed="true"]) {
	border-color: var(--sp-accent);
	box-shadow: inset 0 0 0 1px var(--sp-accent);
}

:where(.sp-checklist) {
	margin: 0 0 1.5em;
	padding: 0;
	list-style: none;
}
:where(.sp-checklist > li) {
	position: relative;
	padding-left: 1.75rem;
}
:where(.sp-checklist > li)::before {
	content: "";
	position: absolute;
	left: 0;
	top: 0.3em;
	display: grid;
	place-items: center;
	width: 1.05em;
	height: 1.05em;
	border: 1.5px solid var(--sp-tone);
	border-radius: 4px;
	font: 700 0.75em/1 var(--sp-font-sans);
}
:where(.sp-checklist > .sp-done) {
	color: var(--sp-muted);
}
:where(.sp-checklist > .sp-done)::before {
	content: "\2713";
	background: var(--sp-tone);
	color: var(--sp-bg);
}
:where(.sp-checklist > .sp-partial)::before {
	background: linear-gradient(var(--sp-tone) 0 0) center / 55% 2px no-repeat;
}
:where(.sp-checklist > .sp-blocked)::before {
	content: "\d7";
	color: var(--sp-tone);
}
`;
