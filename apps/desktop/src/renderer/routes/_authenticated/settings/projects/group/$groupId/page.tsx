import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "renderer/routes/not-found";
import { ProjectGroupSettings } from "./components/ProjectGroupSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/projects/group/$groupId/",
)({
	component: ProjectGroupDetailPage,
	notFoundComponent: NotFound,
});

function ProjectGroupDetailPage() {
	const { groupId } = Route.useParams();
	return <ProjectGroupSettings groupId={groupId} />;
}
