import { createFileRoute } from "@tanstack/react-router";
import { AgentsSettings } from "./components/AgentsSettings";

export type AgentsSettingsSearch = {
	/** Builtin agent preset id (e.g. "claude", "codex"). */
	agent?: string;
};

export const Route = createFileRoute("/_authenticated/settings/agents/")({
	component: AgentsSettingsPage,
	validateSearch: (search: Record<string, unknown>): AgentsSettingsSearch => ({
		agent: typeof search.agent === "string" ? search.agent : undefined,
	}),
});

function AgentsSettingsPage() {
	const { agent } = Route.useSearch();

	return <AgentsSettings initialAgentPresetId={agent ?? null} />;
}
