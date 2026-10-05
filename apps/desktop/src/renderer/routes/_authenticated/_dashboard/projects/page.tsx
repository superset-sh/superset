import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { PROJECT_STATES } from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { ProjectsView } from "./components/ProjectsView";
import type { ProjectsSearch } from "./types";

const stringList = (value: unknown) =>
	(Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === "string" && item.length > 0,
	);

export const Route = createFileRoute("/_authenticated/_dashboard/projects/")({
	component: ProjectsPage,
	validateSearch: (search: Record<string, unknown>): ProjectsSearch => {
		const status = PROJECT_STATES.filter((state) =>
			stringList(search.status).includes(state),
		);
		const leads = stringList(search.leads);
		return {
			status: status.length > 0 ? status : undefined,
			leads: leads.length > 0 ? leads : undefined,
		};
	},
});

function ProjectsPage() {
	const search = Route.useSearch();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <ProjectsView search={search} />;
}
