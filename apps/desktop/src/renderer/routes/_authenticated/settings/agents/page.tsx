import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import {
	type SettingsHostSearch,
	validateSettingsHostSearch,
} from "../hooks/useSettingsHost";
import { AgentsSettingsPage } from "./components/AgentsSettingsPage";

export type AgentsSettingsSearch = SettingsHostSearch & {
	/**
	 * Config UUID or built-in preset id (e.g. "claude", "codex"). Retained for
	 * compatibility with older deep links; new links use the path parameter.
	 */
	agent?: string;
};

export const Route = createFileRoute("/_authenticated/settings/agents/")({
	component: AgentsSettingsIndexRoute,
	validateSearch: (search: Record<string, unknown>): AgentsSettingsSearch => ({
		...validateSettingsHostSearch(search),
		agent: typeof search.agent === "string" ? search.agent : undefined,
	}),
	search: { middlewares: [retainSearchParams(["hostId"])] },
});

function AgentsSettingsIndexRoute() {
	const { agent } = Route.useSearch();
	return <AgentsSettingsPage initialAgentId={agent} />;
}
