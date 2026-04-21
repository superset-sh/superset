import { createFileRoute } from "@tanstack/react-router";
import { V2ProjectSettings } from "../components/V2ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/v2-project/$projectId/general/",
)({
	component: V2ProjectGeneralPage,
});

function V2ProjectGeneralPage() {
	const { projectId } = Route.useParams();
	return <V2ProjectSettings projectId={projectId} />;
}
