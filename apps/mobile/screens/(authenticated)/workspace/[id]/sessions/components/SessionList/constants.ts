import type { TerminalAttention } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";

/** Desktop StatusIndicator colors, as the strip's PingDots use. */
export const ATTENTION_COLORS: Record<TerminalAttention, string> = {
	permission: "#eab308",
	failed: "#ef4444",
	working: "#f59e0b",
	review: "#22c55e",
};

/** Row tint for the session currently attached in the workspace screen. */
export const ROW_TINT = "#27272a";
