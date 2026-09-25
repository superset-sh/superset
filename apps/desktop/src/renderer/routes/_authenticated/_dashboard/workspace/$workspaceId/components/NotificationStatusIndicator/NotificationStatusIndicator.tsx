import { useSourcesNotificationStatus } from "renderer/hooks/host-service/useNotificationStatus";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { NotificationSourceInput } from "renderer/stores/notifications";

interface NotificationStatusIndicatorProps {
	sources: Iterable<NotificationSourceInput>;
	className?: string;
}

export function NotificationStatusIndicator({
	sources,
	className,
}: NotificationStatusIndicatorProps) {
	const { workspace } = useWorkspace();
	const status = useSourcesNotificationStatus(workspace.id, sources);
	if (!status) return null;
	return <StatusIndicator status={status} className={className} />;
}
