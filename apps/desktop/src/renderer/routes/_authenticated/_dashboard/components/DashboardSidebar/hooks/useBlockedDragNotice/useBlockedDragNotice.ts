import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { watchBlockedDragAttempts } from "./watchBlockedDragAttempts";

const NOTICE_TOAST_ID = "sidebar-drag-blocked";

type BlockedDragReason = "sort" | "filter";

interface UseBlockedDragNoticeOptions {
	/** Null while every row can be dragged. A filter outranks a sort. */
	reason: BlockedDragReason | null;
	onSwitchToManualOrder: () => void;
	onClearFilter: () => void;
}

/**
 * Rows are inert while the sidebar shows a sorted or filtered view. Dragging
 * one explains why and offers the way out in the same toast.
 */
export function useBlockedDragNotice({
	reason,
	onSwitchToManualOrder,
	onClearFilter,
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
	};
	const latestNotices = useRef(notices);
	latestNotices.current = notices;

	useEffect(() => {
		if (reason === null) {
			toast.dismiss(NOTICE_TOAST_ID);
			return;
		}
		return watchBlockedDragAttempts(document, () => {
			const notice = latestNotices.current[reason];
			toast(notice.message, {
				id: NOTICE_TOAST_ID,
				action: { label: notice.actionLabel, onClick: notice.onAction },
			});
		});
	}, [reason]);
}
