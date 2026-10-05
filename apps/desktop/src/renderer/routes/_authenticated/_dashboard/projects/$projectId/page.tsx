import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { ProjectRecordScreen } from "./components/ProjectRecordScreen";
import type { ProjectTab } from "./types";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/projects/$projectId/",
)({
	component: ProjectPage,
	validateSearch: (search: Record<string, unknown>): { tab?: ProjectTab } => ({
		tab: search.tab === "progress" ? "progress" : undefined,
	}),
});

function ProjectPage() {
	const { projectId } = Route.useParams();
	const { tab = "overview" } = Route.useSearch();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <ProjectRecordScreen projectId={projectId} tab={tab} />;
}
