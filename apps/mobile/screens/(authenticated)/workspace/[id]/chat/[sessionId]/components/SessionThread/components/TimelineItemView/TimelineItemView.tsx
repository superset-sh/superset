import type { PermissionOutcome } from "@superset/host-service-sync/protocol";
import type { TimelineItem } from "@superset/host-service-sync/timeline";
import { MessageItemView } from "./components/MessageItemView";
import { PlanItemView } from "./components/PlanItemView";
import { ToolCallItemView } from "./components/ToolCallItemView";

export type RespondToPermission = (
	permissionId: string,
	outcome: PermissionOutcome,
) => Promise<void>;

export function TimelineItemView({
	item,
	onRespond,
}: {
	item: TimelineItem;
	onRespond: RespondToPermission;
}) {
	switch (item.kind) {
		case "message":
			return <MessageItemView item={item} />;
		case "tool_call":
			return <ToolCallItemView item={item} onRespond={onRespond} />;
		case "plan":
			return <PlanItemView item={item} />;
		default:
			// A new TimelineItem variant must fail typecheck here, not silently
			// render nothing.
			return item satisfies never;
	}
}
