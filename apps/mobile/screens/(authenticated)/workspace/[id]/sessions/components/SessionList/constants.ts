import type { TerminalAttention } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";

/** Desktop StatusIndicator colors, as the strip's PingDots use. */
export const ATTENTION_COLORS: Record<TerminalAttention, string> = {
	permission: "#eab308",
	failed: "#ef4444",
	working: "#f59e0b",
	review: "#22c55e",
};
