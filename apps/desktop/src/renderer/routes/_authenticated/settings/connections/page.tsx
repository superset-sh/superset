import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsSettings } from "./components/ConnectionsSettings";

export const Route = createFileRoute("/_authenticated/settings/connections/")({
	component: ConnectionsSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function ConnectionsSettingsPage() {
	const { hostId } = Route.useSearch();
	return <ConnectionsSettings hostId={hostId ?? null} />;
}
