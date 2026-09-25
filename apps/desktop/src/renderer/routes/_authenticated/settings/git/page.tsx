import { createFileRoute } from "@tanstack/react-router";
import { GitSettings } from "./components/GitSettings";

export const Route = createFileRoute("/_authenticated/settings/git/")({
	component: GitSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function GitSettingsPage() {
	const { hostId } = Route.useSearch();
	return <GitSettings hostId={hostId ?? null} />;
}
