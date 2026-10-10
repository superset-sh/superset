import type { HostAgentConfig } from "@superset/host-service/settings";
import { useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { AgentSessionSelect } from "./components/AgentSessionSelect";
import { useAgentSessionTitles } from "./hooks/useAgentSessionTitles";

interface AgentSessionPickerProps {
	workspaceId: string | null;
	value: string | null;
	onValueChange: (next: string) => void;
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

export function AgentSessionPicker({
	workspaceId,
	value,
	onValueChange,
	sessions,
	configs,
}: AgentSessionPickerProps) {
	const [open, setOpen] = useState(false);
	const { titles, refreshTitles } = useAgentSessionTitles({
		workspaceId,
		enabled: sessions.length > 0,
		open,
	});
	return (
		<AgentSessionSelect
			value={value}
			onValueChange={onValueChange}
			sessions={sessions}
			configs={configs}
			titles={titles}
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next && sessions.length > 0) void refreshTitles();
			}}
		/>
	);
}
