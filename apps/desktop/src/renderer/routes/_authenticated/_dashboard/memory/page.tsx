import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { MemoryView } from "./components/MemoryView";

interface MemorySearch {
	/** presetId of the agent whose memory file is open. */
	agent?: string;
}

export const Route = createFileRoute("/_authenticated/_dashboard/memory/")({
	validateSearch: (search: Record<string, unknown>): MemorySearch =>
		typeof search.agent === "string" && search.agent.length > 0
			? { agent: search.agent }
			: {},
	component: MemoryPage,
});

function MemoryPage() {
	// undefined = flags still resolving; render nothing rather than flashing a
	// page the user may not be in the audience for. Dev builds bypass the
	// flag — the local dev account isn't in the release condition.
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.MEMORY);
	if (env.NODE_ENV === "development") return <MemoryView />;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	return <MemoryView />;
}
