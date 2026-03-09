import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuLoaderCircle,
	LuMinus,
	LuX,
} from "react-icons/lu";

interface PRChecksStatusProps {
	pr: NonNullable<GitHubStatus["pr"]>;
}

const checkIconConfig = {
	success: { icon: LuCheck, className: "text-emerald-500" },
	failure: { icon: LuX, className: "text-destructive-foreground" },
	pending: { icon: LuLoaderCircle, className: "text-amber-500" },
	skipped: { icon: LuMinus, className: "text-muted-foreground" },
	cancelled: { icon: LuMinus, className: "text-muted-foreground" },
} as const;

function CheckRow({ check }: { check: CheckItem }) {
	const { icon: Icon, className } = checkIconConfig[check.status];

	const content = (
		<span className="flex items-center gap-1.5 py-px">
			<Icon
				className={`size-3 shrink-0 ${className} ${check.status === "pending" ? "animate-spin" : ""}`}
			/>
			<span className="truncate flex-1">{check.name}</span>
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

export function PRChecksStatus({ pr }: PRChecksStatusProps) {
	const [checksExpanded, setChecksExpanded] = useState(false);

	if (pr.state !== "open") return null;

	const relevantChecks = pr.checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	);
	const passing = relevantChecks.filter((c) => c.status === "success").length;
	const total = relevantChecks.length;

	if (total === 0) return null;

	const checksIcon =
		checkIconConfig[pr.checksStatus === "none" ? "pending" : pr.checksStatus];

	return (
		<div className="px-2 pt-1 pb-1.5">
			<button
				type="button"
				onClick={() => setChecksExpanded(!checksExpanded)}
				className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
			>
				{checksExpanded ? (
					<LuChevronDown className="size-3 shrink-0" />
				) : (
					<LuChevronRight className="size-3 shrink-0" />
				)}
				<checksIcon.icon
					className={`size-3 shrink-0 ${checksIcon.className} ${pr.checksStatus === "pending" ? "animate-spin" : ""}`}
				/>
				<span className={checksIcon.className}>
					{passing}/{total} checks
				</span>
			</button>

			{checksExpanded && (
				<div className="mt-1 ml-5 space-y-px text-[11px]">
					{relevantChecks.map((check) => (
						<CheckRow key={check.name} check={check} />
					))}
				</div>
			)}
		</div>
	);
}
