import type { CheckItem } from "main/lib/db/schemas";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { CheckItemRow } from "./components/CheckItemRow";

interface ChecksListProps {
	checks: CheckItem[];
}

export function ChecksList({ checks }: ChecksListProps) {
	const [expanded, setExpanded] = useState(false);

	// Filter out skipped/cancelled for display count, but show all when expanded
	const relevantChecks = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	);

	if (relevantChecks.length === 0) return null;

	return (
		<div className="text-xs">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
			>
				{expanded ? (
					<LuChevronDown className="size-3" />
				) : (
					<LuChevronRight className="size-3" />
				)}
				<span>{expanded ? "Hide checks" : "Show checks"}</span>
			</button>

			{expanded && (
				<div className="mt-1.5 space-y-1 pl-1">
					{relevantChecks.map((check) => (
						<CheckItemRow key={check.name} check={check} />
					))}
				</div>
			)}
		</div>
	);
}
