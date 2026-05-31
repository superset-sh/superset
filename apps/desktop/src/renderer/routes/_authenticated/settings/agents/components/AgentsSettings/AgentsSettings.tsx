import { V2AgentsSettings } from "../V2AgentsSettings";

interface AgentsSettingsProps {
	/** Builtin preset id to pre-select (`?agent=claude`). */
	initialAgentPresetId?: string | null;
}

export function AgentsSettings({ initialAgentPresetId }: AgentsSettingsProps) {
	return <V2AgentsSettings initialAgentPresetId={initialAgentPresetId} />;
}
