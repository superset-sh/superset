import { createFileRoute } from "@tanstack/react-router";
import { SandboxSettings } from "./components/SandboxSettings";

export const Route = createFileRoute("/_authenticated/settings/sandboxes/")({
	component: SandboxSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function SandboxSettingsPage() {
	const { hostId } = Route.useSearch();
	return <SandboxSettings hostId={hostId ?? null} />;
}
