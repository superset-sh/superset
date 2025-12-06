import { Check, LoaderCircle, X } from "lucide-react";
import type { CheckItem } from "main/lib/db/schemas";

interface ChecksSummaryProps {
	checks: CheckItem[];
	status: "success" | "failure" | "pending" | "none";
}

export function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	if (status === "none") return null;

	const passing = checks.filter((c) => c.status === "success").length;
	const total = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	).length;

	const config = {
		success: {
			icon: Check,
			className: "text-emerald-500",
		},
		failure: {
			icon: X,
			className: "text-destructive-foreground",
		},
		pending: {
			icon: LoaderCircle,
			className: "text-amber-500",
		},
	};

	const { icon: Icon, className } = config[status];
	const label = total > 0 ? `${passing}/${total} checks` : "Checks";

	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<Icon
				className={`size-3 ${status === "pending" ? "animate-spin" : ""}`}
			/>
			<span>{label}</span>
		</span>
	);
}
