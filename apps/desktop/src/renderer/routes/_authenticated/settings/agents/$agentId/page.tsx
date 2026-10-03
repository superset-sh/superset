import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import { validateSettingsHostSearch } from "../../hooks/useSettingsHost";
import { AgentsSettingsPage } from "../components/AgentsSettingsPage";

export const Route = createFileRoute(
	"/_authenticated/settings/agents/$agentId/",
)({
	component: AgentSettingsRoute,
	validateSearch: validateSettingsHostSearch,
	search: { middlewares: [retainSearchParams(["hostId"])] },
});

function AgentSettingsRoute() {
	const { agentId } = Route.useParams();
	return <AgentsSettingsPage initialAgentId={agentId} />;
}
