import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

interface PullRequestStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed" | "queued";
}

const LABELS: Record<PullRequestStatusBadgeProps["state"], MessageDescriptor> =
	{
		open: msg({ message: "Open", context: "status" }),
		draft: msg({ message: "Draft" }),
		merged: msg({ message: "Merged" }),
		closed: msg({ message: "Closed" }),
		queued: msg({ message: "Queued" }),
	};

export function PullRequestStatusBadge({ state }: PullRequestStatusBadgeProps) {
	const styles = {
		open: "bg-emerald-500/15 text-emerald-500",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-violet-500/15 text-violet-500",
		closed: "bg-destructive/15 text-destructive",
		queued: "bg-amber-500/15 text-amber-500",
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${styles[state]}`}
		>
			{i18n._(LABELS[state])}
		</span>
	);
}
