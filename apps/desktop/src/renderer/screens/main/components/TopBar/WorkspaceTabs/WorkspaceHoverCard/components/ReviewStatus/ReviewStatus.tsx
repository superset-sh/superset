interface ReviewStatusProps {
	status: "approved" | "changes_requested" | "pending";
}

export function ReviewStatus({ status }: ReviewStatusProps) {
	const config = {
		approved: { label: "Approved", className: "text-emerald-500" },
		changes_requested: {
			label: "Changes requested",
			className: "text-destructive-foreground",
		},
		pending: { label: "Review pending", className: "text-muted-foreground" },
	};

	const { label, className } = config[status];

	return <span className={className}>{label}</span>;
}
