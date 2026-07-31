import { cn } from "@superset/ui/utils";
import {
	LuBot,
	LuCircleDot,
	LuGithub,
	LuGitPullRequest,
	LuInbox,
} from "react-icons/lu";
import type { FactoryWorkItem } from "../../types";

interface FactoryWorkItemCardProps {
	item: FactoryWorkItem;
	selected: boolean;
	onSelect: () => void;
}

function SourceIcon({ item }: { item: FactoryWorkItem }) {
	if (item.source === "github-pr")
		return <LuGitPullRequest className="size-3" />;
	if (item.source === "github-issue") return <LuGithub className="size-3" />;
	if (item.source === "linear-issue") return <LuCircleDot className="size-3" />;
	return <LuInbox className="size-3" />;
}

export function FactoryWorkItemCard({
	item,
	selected,
	onSelect,
}: FactoryWorkItemCardProps) {
	const checks = item.metadata.checks;
	const diff = item.metadata.diff;

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onSelect}
			className={cn(
				"group w-full rounded-md border bg-card/45 p-3 text-left shadow-xs transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-foreground/20 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
				selected ? "border-primary/70 bg-primary/[0.06]" : "border-border/70",
			)}
		>
			<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
				<SourceIcon item={item} />
				<span className="min-w-0 flex-1 truncate font-mono">
					{item.sourceKey ?? "Manual"}
				</span>
				<span className="shrink-0 tabular-nums">
					{item.metadata.age ?? "now"}
				</span>
			</div>

			<p className="mt-2 line-clamp-3 text-sm font-medium leading-snug text-foreground">
				{item.title}
			</p>

			{item.metadata.agent && (
				<div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
					<LuBot className="size-3 text-primary" />
					<span className="truncate">{item.metadata.agent}</span>
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
					/>
					<span className="sr-only">agent is active</span>
				</div>
			)}

			{checks && (
				<div
					className={cn(
						"mt-3 text-xs font-medium tabular-nums",
						checks.failed > 0
							? "text-red-600 dark:text-red-400"
							: "text-emerald-700 dark:text-emerald-400",
					)}
				>
					{checks.failed > 0
						? `${checks.failed} check failed`
						: `${checks.passed} checks passing`}
				</div>
			)}

			{diff && !checks && (
				<div className="mt-3 flex items-center gap-2 font-mono text-xs tabular-nums">
					<span className="text-emerald-700 dark:text-emerald-400">
						+{diff.additions}
					</span>
					<span className="text-red-600 dark:text-red-400">
						−{diff.deletions}
					</span>
					<span className="text-muted-foreground">{diff.files} files</span>
				</div>
			)}

			<div className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
				<span className="text-muted-foreground/70">Next · </span>
				<span className={cn(selected && "text-primary")}>
					{item.metadata.decision ?? "Continue"}
				</span>
			</div>
		</button>
	);
}
