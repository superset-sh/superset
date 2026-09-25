import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "renderer/routes/not-found";
import { ProjectSettings } from "./components/ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/projects/$projectId/",
)({
	component: ProjectDetailPage,
	notFoundComponent: NotFound,
	validateSearch: (
		search: Record<string, unknown>,
	): { hostId?: string; focus?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
		// One-shot deep-link target: scroll to and focus a specific field
		// (e.g. "naming-instructions" from the new-workspace project picker).
		focus: typeof search.focus === "string" ? search.focus : undefined,
	}),
});

function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const { hostId, focus } = Route.useSearch();
	return (
		<ProjectSettings
			projectId={projectId}
			hostId={hostId ?? null}
			focusField={focus ?? null}
		/>
	);
}
