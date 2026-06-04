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
			className: "bg-emerald-500/15 text-emerald-500",
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
			className: "bg-amber-500/15 text-amber-500",
		},
	};

	const { label, className } = config[status];

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 truncate max-w-[200px] ${className}`}
			title={label}
		>
			{label}
		</span>
	);
}
