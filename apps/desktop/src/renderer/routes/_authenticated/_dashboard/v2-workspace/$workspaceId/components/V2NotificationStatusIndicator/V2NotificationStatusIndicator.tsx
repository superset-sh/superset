import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useV2SourceIdsNotificationStatus } from "renderer/stores/v2-notifications";

interface V2NotificationStatusIndicatorProps {
	workspaceId: string;
	sourceIds: Iterable<string>;
	className?: string;
}

export function V2NotificationStatusIndicator({
	workspaceId,
	sourceIds,
	className,
}: V2NotificationStatusIndicatorProps) {
	const status = useV2SourceIdsNotificationStatus(workspaceId, sourceIds);
	if (!status) return null;
	return <StatusIndicator status={status} className={className} />;
}
