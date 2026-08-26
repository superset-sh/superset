import type { ChartConfig } from "@superset/ui/chart";

/**
 * Fixed categorical hue order — color follows the provider, never its rank.
 * Both hexes validated (light + dark surfaces) with the dataviz palette
 * checker: lightness band, chroma, CVD ΔE ≥ 20, contrast ≥ 3:1 all pass.
 */
export const PROVIDER_CHART_CONFIG = {
	claude: { label: "Claude Code", color: "#d06a48" },
	codex: { label: "Codex", color: "#1596d6" },
} satisfies ChartConfig;

export const PROVIDER_ORDER = ["claude", "codex"] as const;

export type HistoryMetric = "usd" | "tokens";
export const RANGE_OPTIONS = [7, 30, 90] as const;
