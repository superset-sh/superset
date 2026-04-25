import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	useV2SourcesNotificationStatus,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";

interface V2NotificationStatusIndicatorProps {
	workspaceId: string;
	sources: Iterable<V2NotificationSourceInput>;
	className?: string;
}

export function V2NotificationStatusIndicator({
	workspaceId,
	sources,
	className,
}: V2NotificationStatusIndicatorProps) {
	const status = useV2SourcesNotificationStatus(workspaceId, sources);
	if (!status) return null;
	return <StatusIndicator status={status} className={className} />;
}
