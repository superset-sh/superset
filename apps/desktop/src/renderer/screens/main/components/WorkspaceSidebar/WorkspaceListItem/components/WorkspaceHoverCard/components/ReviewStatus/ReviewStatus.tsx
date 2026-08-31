interface ReviewStatusProps {
	status: "approved" | "changes_requested" | "pending";
	requestedReviewers?: string[];
}

export function ReviewStatus({
	status,
	requestedReviewers,
}: ReviewStatusProps) {
	const config = {
		approved: {
			label: "Approved",
			className: "bg-success/15 text-success",
		},
		changes_requested: {
			label: "Changes requested",
			className: "bg-destructive/15 text-destructive-foreground",
		},
		pending: {
			label:
				requestedReviewers && requestedReviewers.length > 0
					? `Awaiting ${requestedReviewers.join(", ")}`
					: "Review pending",
			className: "bg-warning/15 text-warning",
		},
	};

	const { label, className } = config[status];

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 truncate max-w-[200px] ${className}`}
			title={label}
		>
			{label}
		</span>
	);
}
