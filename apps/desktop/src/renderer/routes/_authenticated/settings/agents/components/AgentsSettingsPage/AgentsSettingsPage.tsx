import { AgentsSettings } from "../AgentsSettings";

interface AgentsSettingsPageProps {
	initialAgentId?: string | null;
}

export function AgentsSettingsPage({
	initialAgentId = null,
}: AgentsSettingsPageProps) {
	return <AgentsSettings initialAgentId={initialAgentId} />;
}
