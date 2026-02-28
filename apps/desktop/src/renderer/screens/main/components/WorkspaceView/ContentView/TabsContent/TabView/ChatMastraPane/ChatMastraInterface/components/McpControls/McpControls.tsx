import { McpOverviewPicker } from "../../../../ChatPane/ChatInterface/components/McpOverviewPicker";
import type { UseMcpUiReturn } from "../../hooks/useMcpUi";

interface McpControlsProps {
	mcpUi: UseMcpUiReturn;
}

export function McpControls({ mcpUi }: McpControlsProps) {
	return (
		<McpOverviewPicker
			overview={mcpUi.overview}
			open={mcpUi.overviewOpen}
			onOpenChange={mcpUi.setOverviewOpen}
			onAuthenticateServer={mcpUi.authenticateServer}
			authenticatingServerName={mcpUi.authenticatingServerName}
		/>
	);
}
