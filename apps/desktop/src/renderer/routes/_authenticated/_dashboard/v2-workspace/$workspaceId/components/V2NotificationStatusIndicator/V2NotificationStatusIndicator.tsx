import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	useV2SourcesNotificationStatus,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";

interface V2NotificationStatusIndicatorProps {
	sources: Iterable<V2NotificationSourceInput>;
	className?: string;
}

export function V2NotificationStatusIndicator({
	sources,
	className,
}: V2NotificationStatusIndicatorProps) {
	const { workspace } = useWorkspace();
	const status = useV2SourcesNotificationStatus(workspace.id, sources);
	if (!status) return null;
	return <StatusIndicator status={status} className={className} />;
}
