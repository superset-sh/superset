/** Props accepted by the {@link PRStatusBadge} component. */
interface PRStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed" | "queued";
}

/** Renders a small coloured badge showing the current pull request state label (e.g. "Open", "Queued"). */
export function PRStatusBadge({ state }: PRStatusBadgeProps) {
	const styles = {
		open: "bg-emerald-500/15 text-emerald-500",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-violet-500/15 text-violet-500",
		closed: "bg-destructive/15 text-destructive-foreground",
		queued: "bg-amber-500/15 text-amber-500",
	};

	const labels = {
		open: "Open",
		draft: "Draft",
		merged: "Merged",
		closed: "Closed",
		queued: "Queued",
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}
