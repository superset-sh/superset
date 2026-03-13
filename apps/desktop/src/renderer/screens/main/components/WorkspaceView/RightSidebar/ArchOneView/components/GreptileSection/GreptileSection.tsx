import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuExternalLink,
	LuLoader,
	LuPlay,
	LuRefreshCw,
	LuShield,
	LuSquare,
} from "react-icons/lu";
import type { FixLoopState } from "../../ArchOneView";

interface GreptileData {
	score: number | null;
	maxScore: number;
	summary: string | null;
	issues: string[];
	prNumber: number | null;
	prTitle: string | null;
	prUrl: string | null;
	reviewing: boolean;
	error: string | null;
}

interface GreptileSectionProps {
	data: GreptileData | undefined;
	isLoading: boolean;
	onRefresh: () => void;
	onFixGreptile: () => void;
	onStopFix: () => void;
	fixLoop: FixLoopState;
	maxIterations: number;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
	const percentage = (score / max) * 100;
	const color =
		score >= 4
			? "bg-green-500"
			: score >= 3
				? "bg-yellow-500"
				: score >= 2
					? "bg-orange-500"
					: "bg-red-500";

	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-2 rounded-full bg-accent/50 overflow-hidden">
				<div
					className={cn("h-full rounded-full transition-all", color)}
					style={{ width: `${percentage}%` }}
				/>
			</div>
			<span
				className={cn(
					"text-sm font-bold shrink-0",
					score >= 4
						? "text-green-500"
						: score >= 3
							? "text-yellow-500"
							: score >= 2
								? "text-orange-500"
								: "text-red-500",
				)}
			>
				{score}/{max}
			</span>
		</div>
	);
}

function ScoreLabel({ score }: { score: number }) {
	if (score >= 5)
		return <span className="text-green-400">Production ready</span>;
	if (score >= 4)
		return <span className="text-green-400">Minor polish needed</span>;
	if (score >= 3)
		return <span className="text-yellow-400">Implementation issues</span>;
	if (score >= 2)
		return <span className="text-orange-400">Significant bugs</span>;
	return <span className="text-red-400">Critical problems</span>;
}

function FixLoopBadge({
	fixLoop,
	maxIterations,
}: {
	fixLoop: FixLoopState;
	maxIterations: number;
}) {
	if (fixLoop.phase === "idle") return null;

	if (fixLoop.phase === "fixing") {
		return (
			<div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 rounded px-2 py-1">
				<LuLoader className="size-3 animate-spin" />
				<span>
					Claude is fixing ({fixLoop.iteration}/{maxIterations})
				</span>
			</div>
		);
	}

	if (fixLoop.phase === "waiting-for-review") {
		return (
			<div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1">
				<LuLoader className="size-3 animate-spin" />
				<span>
					Waiting for Greptile re-review ({fixLoop.iteration}/{maxIterations})
				</span>
			</div>
		);
	}

	if (fixLoop.phase === "done") {
		return (
			<div className="text-xs text-green-400 bg-green-500/10 rounded px-2 py-1">
				Fixed in {fixLoop.iteration}{" "}
				{fixLoop.iteration === 1 ? "iteration" : "iterations"}
			</div>
		);
	}

	if (fixLoop.phase === "max-reached") {
		return (
			<div className="text-xs text-orange-400 bg-orange-500/10 rounded px-2 py-1">
				Max iterations reached ({maxIterations})
			</div>
		);
	}

	if (fixLoop.phase === "stopped") {
		return (
			<div className="text-xs text-muted-foreground bg-accent/30 rounded px-2 py-1">
				Stopped after {fixLoop.iteration}{" "}
				{fixLoop.iteration === 1 ? "iteration" : "iterations"}
			</div>
		);
	}

	return null;
}

export function GreptileSection({
	data,
	isLoading,
	onRefresh,
	onFixGreptile,
	onStopFix,
	fixLoop,
	maxIterations,
}: GreptileSectionProps) {
	const [collapsed, setCollapsed] = useState(false);

	const isFixActive =
		fixLoop.phase === "fixing" || fixLoop.phase === "waiting-for-review";

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuShield className="size-3 shrink-0" />
				<span>Greptile</span>
				{fixLoop.phase === "fixing" && (
					<span className="ml-auto inline-flex items-center gap-1 text-[10px] text-blue-400">
						<LuLoader className="size-2.5 animate-spin" />
						Fixing {fixLoop.iteration}/{maxIterations}
					</span>
				)}
				{fixLoop.phase === "waiting-for-review" && (
					<span className="ml-auto inline-flex items-center gap-1 text-[10px] text-yellow-400">
						<LuLoader className="size-2.5 animate-spin" />
						Re-reviewing
					</span>
				)}
				{!isFixActive && data?.reviewing && (
					<span className="ml-auto inline-flex items-center gap-1 text-[10px] text-yellow-400">
						<LuLoader className="size-2.5 animate-spin" />
						Reviewing
					</span>
				)}
				{data?.score !== null &&
					data?.score !== undefined &&
					!data.reviewing &&
					!isFixActive && (
						<span
							className={cn(
								"ml-auto text-xs font-bold",
								data.score >= 4
									? "text-green-500"
									: data.score >= 3
										? "text-yellow-500"
										: "text-red-500",
							)}
						>
							{data.score}/5
						</span>
					)}
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm space-y-2">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !data || data.error ? (
						<div className="space-y-1.5">
							<p className="text-muted-foreground text-xs">
								{data?.error ?? "No data"}
							</p>
							{data?.prNumber && data.prUrl && (
								<a
									href={data.prUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
								>
									PR #{data.prNumber}
									<LuExternalLink className="size-3" />
								</a>
							)}
							<button
								type="button"
								onClick={onRefresh}
								className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
							>
								<LuRefreshCw className="size-3" />
								Refresh
							</button>
						</div>
					) : data.reviewing && !isFixActive ? (
						<div className="space-y-2">
							{data.prNumber && (
								<div className="flex items-center gap-1.5 text-xs">
									<a
										href={data.prUrl ?? "#"}
										target="_blank"
										rel="noreferrer"
										className="text-primary hover:underline truncate"
									>
										#{data.prNumber} {data.prTitle}
									</a>
								</div>
							)}
							<div className="flex items-center gap-2 text-xs text-yellow-400">
								<LuLoader className="size-3 animate-spin" />
								<span>Greptile is reviewing this PR...</span>
							</div>
							<div className="flex items-center gap-3">
								{data.prUrl && (
									<a
										href={data.prUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
									>
										View PR
										<LuExternalLink className="size-3" />
									</a>
								)}
								<button
									type="button"
									onClick={onRefresh}
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								>
									<LuRefreshCw className="size-3" />
									Refresh
								</button>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							{/* PR info */}
							{data.prNumber && (
								<div className="flex items-center gap-1.5 text-xs">
									<a
										href={data.prUrl ?? "#"}
										target="_blank"
										rel="noreferrer"
										className="text-primary hover:underline truncate"
									>
										#{data.prNumber} {data.prTitle}
									</a>
								</div>
							)}

							{/* Score bar */}
							{data.score !== null && (
								<>
									<ScoreBar score={data.score} max={data.maxScore} />
									<p className="text-xs">
										<ScoreLabel score={data.score} />
									</p>
								</>
							)}

							{/* Fix loop status */}
							<FixLoopBadge fixLoop={fixLoop} maxIterations={maxIterations} />

							{/* Summary */}
							{data.summary && (
								<p className="text-xs text-muted-foreground line-clamp-3">
									{data.summary}
								</p>
							)}

							{/* Issues */}
							{data.issues && data.issues.length > 0 && (
								<ul className="space-y-1 text-xs text-muted-foreground">
									{data.issues.map((issue) => (
										<li key={issue} className="flex gap-1.5 items-start">
											<span className="text-red-400 shrink-0 mt-0.5">
												&bull;
											</span>
											<span>{issue}</span>
										</li>
									))}
								</ul>
							)}

							{/* Actions */}
							<div className="flex items-center gap-3 flex-wrap">
								{data.prUrl && (
									<a
										href={data.prUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
									>
										View PR
										<LuExternalLink className="size-3" />
									</a>
								)}
								<button
									type="button"
									onClick={onRefresh}
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								>
									<LuRefreshCw className="size-3" />
									Refresh
								</button>
								{isFixActive ? (
									<button
										type="button"
										onClick={onStopFix}
										className="flex items-center gap-1 text-xs transition-colors cursor-pointer font-medium text-red-400 hover:text-red-300"
									>
										<LuSquare className="size-3" />
										Stop
									</button>
								) : (
									<button
										type="button"
										onClick={onFixGreptile}
										className="flex items-center gap-1 text-xs transition-colors cursor-pointer font-medium text-primary hover:text-primary/80"
									>
										<LuPlay className="size-3" />
										Fix with Claude
									</button>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
