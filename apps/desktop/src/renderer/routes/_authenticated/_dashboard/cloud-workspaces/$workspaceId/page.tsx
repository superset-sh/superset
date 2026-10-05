import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { CloudWorkspaceRecordScreen } from "./components/CloudWorkspaceRecordScreen";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/cloud-workspaces/$workspaceId/",
)({
	component: CloudWorkspaceRecordPage,
});

function CloudWorkspaceRecordPage() {
	const { workspaceId } = Route.useParams();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <CloudWorkspaceRecordScreen workspaceId={workspaceId} />;
}
