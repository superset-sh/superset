import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

interface PullRequestStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed" | "queued";
}

const LABELS: Record<PullRequestStatusBadgeProps["state"], MessageDescriptor> =
	{
		open: msg({ id: "dashboard.sidebar.prStatus.open", message: "Open" }),
		draft: msg({ id: "dashboard.sidebar.prStatus.draft", message: "Draft" }),
		merged: msg({ id: "dashboard.sidebar.prStatus.merged", message: "Merged" }),
		closed: msg({ id: "dashboard.sidebar.prStatus.closed", message: "Closed" }),
		queued: msg({ id: "dashboard.sidebar.prStatus.queued", message: "Queued" }),
	};

export function PullRequestStatusBadge({ state }: PullRequestStatusBadgeProps) {
	const styles = {
		open: "bg-success/15 text-success",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-status-1/15 text-status-1",
		closed: "bg-destructive/15 text-destructive-foreground",
		queued: "bg-warning/15 text-warning",
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${styles[state]}`}
		>
			{i18n._(LABELS[state])}
		</span>
	);
}
