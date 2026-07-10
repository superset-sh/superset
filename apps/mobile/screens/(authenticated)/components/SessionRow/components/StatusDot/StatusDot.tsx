import { View } from "react-native";
import type { TerminalAgentStatus } from "@/screens/(authenticated)/utils/sessionRows";

// Desktop StatusIndicator STATUS_CONFIG colors (tailwind 500).
const DOT_COLORS: Record<Exclude<TerminalAgentStatus, "idle">, string> = {
	permission: "#ef4444",
	working: "#f59e0b",
};

export function StatusDot({ status }: { status: TerminalAgentStatus }) {
	if (status === "idle") return null;
	return (
		<View
			className="border-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2"
			style={{ backgroundColor: DOT_COLORS[status] }}
		/>
	);
}
