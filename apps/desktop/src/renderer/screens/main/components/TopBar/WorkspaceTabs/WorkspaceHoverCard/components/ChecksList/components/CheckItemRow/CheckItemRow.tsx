import { Check, LoaderCircle, Minus, X } from "lucide-react";
import type { CheckItem } from "main/lib/db/schemas";

interface CheckItemRowProps {
	check: CheckItem;
}

export function CheckItemRow({ check }: CheckItemRowProps) {
	const statusConfig = {
		success: { icon: Check, className: "text-emerald-500" },
		failure: { icon: X, className: "text-destructive-foreground" },
		pending: { icon: LoaderCircle, className: "text-amber-500" },
		skipped: { icon: Minus, className: "text-muted-foreground" },
		cancelled: { icon: Minus, className: "text-muted-foreground" },
	};

	const { icon: Icon, className } = statusConfig[check.status];

	const content = (
		<span className="flex items-center gap-1.5 py-0.5">
			<Icon
				className={`size-3 shrink-0 ${className} ${check.status === "pending" ? "animate-spin" : ""}`}
			/>
			<span className="truncate">{check.name}</span>
		</span>
	);

	if (check.url) {
		return (
			<a
				href={check.url}
				target="_blank"
				rel="noopener noreferrer"
				className="block text-muted-foreground hover:text-foreground transition-colors"
			>
				{content}
			</a>
		);
	}

	return <div className="text-muted-foreground">{content}</div>;
}
