import type { ChartConfig } from "@superset/ui/chart";

/**
 * Fixed categorical hue order — color follows the provider, never its rank.
 * All nine hexes validated (light + dark surfaces) with the dataviz palette
 * checker in this order: lightness band, chroma, adjacent-pair CVD ΔE,
 * normal-vision floor, contrast ≥ 3:1 all pass.
 */
export const PROVIDER_CHART_CONFIG = {
	claude: { label: "Claude Code", color: "#d06a48" },
	codex: { label: "Codex", color: "#1596d6" },
	grok: { label: "Grok", color: "#2f9e63" },
	cursor: { label: "Cursor", color: "#8a63d2" },
	opencode: { label: "OpenCode", color: "#b3852d" },
	copilot: { label: "Copilot", color: "#22a5b8" },
	pi: { label: "Pi", color: "#b04a82" },
	omp: { label: "Oh My Pi", color: "#829c2e" },
	fx: { label: "fx", color: "#5b6bd6" },
} satisfies ChartConfig;

/** Preset-icon registry keys per provider (cursor's icon is keyed by its
 * agent id `cursor-agent`; omp shares pi's mark). */
export const PROVIDER_ICON_KEY: Record<
	keyof typeof PROVIDER_CHART_CONFIG,
	string
> = {
	claude: "claude",
	codex: "codex",
	grok: "grok",
	cursor: "cursor-agent",
	opencode: "opencode",
	copilot: "copilot",
	pi: "pi",
	omp: "omp",
	fx: "fx",
};

export const PROVIDER_ORDER = [
	"claude",
	"codex",
	"grok",
	"cursor",
	"opencode",
	"copilot",
	"pi",
	"omp",
	"fx",
] as const;

export type HistoryMetric = "usd" | "tokens";
export const RANGE_OPTIONS = [7, 30, 90] as const;
