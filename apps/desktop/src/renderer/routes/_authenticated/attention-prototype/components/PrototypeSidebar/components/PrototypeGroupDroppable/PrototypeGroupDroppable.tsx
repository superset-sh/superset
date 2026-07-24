import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

/** Prefix for a group's droppable id, e.g. `group:backlog`. */
export const GROUP_DROP_ID_PREFIX = "group:";

interface PrototypeGroupDroppableProps {
	/** The group key a workspace dropped here is reassigned to. */
	groupKey: string;
	/**
	 * Groups are drop targets only under Linear grouping, where a drop reassigns
	 * the workspace's status. Disabled for every other group-by so drops keep
	 * clamping to the source group.
	 */
	disabled?: boolean;
	children: ReactNode;
}

/**
 * Wraps a group's header (and, for an empty column, its drag-time drop area) in
 * a dnd-kit droppable, so a workspace can be dropped anywhere on the group — not
 * just onto one of its rows. Dropping reassigns the workspace's Linear status to
 * this group; the view then re-sorts it into place per the active ordering.
 */
export function PrototypeGroupDroppable({
	groupKey,
	disabled,
	children,
}: PrototypeGroupDroppableProps) {
	const { setNodeRef } = useDroppable({
		id: `${GROUP_DROP_ID_PREFIX}${groupKey}`,
		disabled,
	});

	return <div ref={setNodeRef}>{children}</div>;
}
