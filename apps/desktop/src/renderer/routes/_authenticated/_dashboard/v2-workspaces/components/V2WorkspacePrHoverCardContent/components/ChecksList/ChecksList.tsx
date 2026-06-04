import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { CheckRow } from "./components/CheckRow";

interface ChecksListProps {
	checks: V2WorkspacePrSummary["checks"];
}

export function ChecksList({ checks }: ChecksListProps) {
	const [expanded, setExpanded] = useState(false);

	const relevant = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	);
	if (relevant.length === 0) return null;

	return (
		<div className="text-xs">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			>
				{expanded ? (
					<LuChevronDown className="size-3" />
				) : (
					<LuChevronRight className="size-3" />
				)}
				<span>{expanded ? "Hide checks" : "Show checks"}</span>
			</button>

			{expanded ? (
				<div className="mt-1.5 space-y-1 pl-1">
					{relevant.map((check) => (
						<CheckRow key={check.name} check={check} />
					))}
				</div>
			) : null}
		</div>
	);
}
