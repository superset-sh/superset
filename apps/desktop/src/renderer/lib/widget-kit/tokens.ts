/**
 * Design tokens exposed to widgets. Each entry maps a token name to both its
 * CSS custom-property reference (`cssVar`, usable in inline styles) and a
 * Tailwind utility hint (`text` / `bg` / `border` class) so widget authors can
 * stay on-palette without hard-coding OKLCH values. The OKLCH source of truth
 * lives in packages/ui/src/globals.css; see docs/workspace-card-widgets.md for
 * the full table and light/dark values.
 */

export interface WidgetColorToken {
	/** CSS var reference, e.g. "var(--color-muted-foreground)". */
	cssVar: string;
	/** Tailwind text-color class, e.g. "text-muted-foreground". */
	text: string;
	/** Tailwind background-color class, e.g. "bg-muted". */
	bg: string;
	/** Tailwind border-color class, e.g. "border-muted". */
	border: string;
}

function color(name: string): WidgetColorToken {
	return {
		cssVar: `var(--color-${name})`,
		text: `text-${name}`,
		bg: `bg-${name}`,
		border: `border-${name}`,
	};
}

/** Color tokens (light/dark resolved automatically via CSS vars). */
export const colors = {
	background: color("background"),
	foreground: color("foreground"),
	muted: color("muted"),
	mutedForeground: color("muted-foreground"),
	primary: color("primary"),
	primaryForeground: color("primary-foreground"),
	destructive: color("destructive"),
	border: color("border"),
	sidebar: color("sidebar"),
	sidebarForeground: color("sidebar-foreground"),
	sidebarPrimary: color("sidebar-primary"),
	sidebarAccent: color("sidebar-accent"),
	sidebarBorder: color("sidebar-border"),
	chart1: color("chart-1"),
	chart2: color("chart-2"),
	chart3: color("chart-3"),
	chart4: color("chart-4"),
	chart5: color("chart-5"),
} as const;

export type WidgetColorName = keyof typeof colors;

/** The five chart palette colors — the supported set for Badge `color`. */
export const chartColors = [
	"chart1",
	"chart2",
	"chart3",
	"chart4",
	"chart5",
] as const satisfies readonly WidgetColorName[];

export type ChartColorName = (typeof chartColors)[number];

/** Radius tokens (CSS var refs + Tailwind rounded-* classes). */
export const radius = {
	sm: { cssVar: "var(--radius-sm)", className: "rounded-sm" },
	md: { cssVar: "var(--radius-md)", className: "rounded-md" },
	lg: { cssVar: "var(--radius-lg)", className: "rounded-lg" },
} as const;

/** Font-size / line-height conventions used on workspace cards. */
export const text = {
	/** The standard card line size — 11px, tight leading. */
	cardLine: "text-[11px] leading-tight",
	/** Slightly smaller (10px) for secondary metadata. */
	caption: "text-[10px] leading-tight",
} as const;

/** Spacing convention used between inline card items. */
export const spacing = {
	rowGap: "gap-1.5",
} as const;

/**
 * The full typed token map handed to widgets as `kit.tokens`. Authors reference
 * `kit.tokens.colors.chart1.text`, `kit.tokens.radius.md.className`, etc.
 */
export const tokens = {
	colors,
	chartColors,
	radius,
	text,
	spacing,
} as const;

export type WidgetTokens = typeof tokens;
