import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import {
	getBlockedDragTarget,
	watchBlockedDragAttempts,
} from "./watchBlockedDragAttempts";

const NOTICE_TOAST_ID = "sidebar-drag-blocked";

type BlockedDragReason = "sort" | "filter" | "emptyProjects";

interface UseBlockedDragNoticeOptions {
	/** Why workspace and folder rows are inert; null while they can be dragged. */
	reason: BlockedDragReason | null;
	/** Why project rows are inert; null while they can be dragged. */
	projectReason: BlockedDragReason | null;
	onSwitchToManualOrder: () => void;
	onClearFilter: () => void;
	onShowEmptyProjects: () => void;
}

/**
 * Rows are inert while the sidebar shows a sorted or filtered view. Dragging
 * one explains why and offers the way out in the same toast.
 */
export function useBlockedDragNotice({
	reason,
	projectReason,
	onSwitchToManualOrder,
	onClearFilter,
	onShowEmptyProjects,
}: UseBlockedDragNoticeOptions): void {
	const { t } = useLingui();
	const notices = {
		sort: {
			message: t({
				message: "Switch to manual order to rearrange the sidebar",
			}),
			actionLabel: t({ message: "Manual order" }),
			onAction: onSwitchToManualOrder,
		},
		filter: {
			message: t({ message: "Clear the filter to rearrange the sidebar" }),
			actionLabel: t({ message: "Clear filter" }),
			onAction: onClearFilter,
		},
		emptyProjects: {
			message: t({
				message: "Show empty projects to rearrange the sidebar",
			}),
			actionLabel: t({ message: "Show empty projects" }),
			onAction: onShowEmptyProjects,
		},
	};
	const latestNotices = useRef(notices);
	latestNotices.current = notices;

	useEffect(() => {
		if (reason === null && projectReason === null) {
			toast.dismiss(NOTICE_TOAST_ID);
			return;
		}
		return watchBlockedDragAttempts(document, (blocked) => {
			const blockedReason =
				getBlockedDragTarget(blocked) === "project" ? projectReason : reason;
			if (blockedReason === null) return;
			const notice = latestNotices.current[blockedReason];
			toast(notice.message, {
				id: NOTICE_TOAST_ID,
				action: { label: notice.actionLabel, onClick: notice.onAction },
			});
		});
	}, [reason, projectReason]);
}
