import { createFileRoute } from "@tanstack/react-router";
import { V2GitSettings } from "./components/V2GitSettings";

export const Route = createFileRoute("/_authenticated/settings/git/")({
	component: GitSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function GitSettingsPage() {
	const { hostId } = Route.useSearch();

	return <V2GitSettings hostId={hostId ?? null} />;
}
