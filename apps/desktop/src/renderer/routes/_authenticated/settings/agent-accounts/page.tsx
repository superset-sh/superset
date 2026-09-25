import { createFileRoute } from "@tanstack/react-router";
import { AgentAccountsSettings } from "./components/AgentAccountsSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/agent-accounts/",
)({
	component: AgentAccountsSettings,
});
