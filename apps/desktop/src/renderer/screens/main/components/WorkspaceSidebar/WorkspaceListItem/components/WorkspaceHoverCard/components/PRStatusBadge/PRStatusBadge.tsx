interface PRStatusBadgeProps {
	state: "open" | "draft" | "merged" | "closed";
}

export function PRStatusBadge({ state }: PRStatusBadgeProps) {
	const styles = {
		open: "bg-success/15 text-success",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-status-1/15 text-status-1",
		closed: "bg-destructive/15 text-destructive-foreground",
	};

	const labels = {
		open: "Open",
		draft: "Draft",
		merged: "Merged",
		closed: "Closed",
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}
