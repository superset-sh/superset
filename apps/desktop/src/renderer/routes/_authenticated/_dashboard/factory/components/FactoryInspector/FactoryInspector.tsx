import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuBot,
	LuCheck,
	LuCircle,
	LuCircleDot,
	LuCopy,
	LuExternalLink,
	LuGitBranch,
	LuGithub,
	LuGitPullRequest,
	LuPanelRightClose,
	LuPlay,
	LuX,
} from "react-icons/lu";
import type { FactoryStage, FactoryWorkItem } from "../../types";
import {
	getFactoryStage,
	getFactoryStageLabel,
	getNextFactoryStage,
} from "../../utils/factory-utils";

type InspectorTab = "plan" | "activity" | "checks";

interface FactoryInspectorProps {
	item: FactoryWorkItem;
	pending: boolean;
	onAdvance: (stage: FactoryStage) => void;
	onClose: () => void;
	onOpenPullRequest: () => void;
	onOpenWorkspace: () => void;
}

function PlanStatusIcon({
	status,
}: {
	status: "complete" | "in-progress" | "pending";
}) {
	if (status === "complete") {
		return (
			<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
				<LuCheck className="size-3" />
			</span>
		);
	}
	if (status === "in-progress") {
		return (
			<span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary text-primary">
				<span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
			</span>
		);
	}
	return <LuCircle className="size-4 shrink-0 text-muted-foreground/50" />;
}

function primaryAction(stage: FactoryStage, checksFailed: number) {
	if (stage === "intake") return "Start triage";
	if (stage === "triage") return "Accept investigation";
	if (stage === "planning") return "Approve plan";
	if (stage === "execute") return "Open workspace";
	if (stage === "review" && checksFailed > 0) return "Open workspace";
	if (stage === "review") return "Open pull request";
	return null;
}

export function FactoryInspector({
	item,
	pending,
	onAdvance,
	onClose,
	onOpenPullRequest,
	onOpenWorkspace,
}: FactoryInspectorProps) {
	const [tab, setTab] = useState<InspectorTab>("plan");
	const stage = getFactoryStage(item);
	const nextStage = getNextFactoryStage(stage);
	const checks = item.metadata.checks;
	const action = primaryAction(stage, checks?.failed ?? 0);
	const plan = item.metadata.plan ?? [
		{
			label: "Understand the request and repository context",
			status: "complete",
		},
		{ label: "Define the smallest safe implementation", status: "in-progress" },
		{ label: "Run the repository-owned validation", status: "pending" },
	];

	const handlePrimaryAction = () => {
		if (stage === "review" && (checks?.failed ?? 0) === 0) {
			onOpenPullRequest();
			return;
		}
		if (stage === "execute" || stage === "review") {
			onOpenWorkspace();
			return;
		}
		if (nextStage) onAdvance(nextStage);
	};

	return (
		<aside className="absolute inset-y-0 right-0 z-20 flex w-full shrink-0 flex-col overflow-hidden border-l border-border bg-background shadow-xl sm:w-96 xl:relative xl:z-auto xl:shadow-none">
			<header className="border-b border-border px-4 py-3">
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							{item.source === "github-pr" ? (
								<LuGitPullRequest className="size-3" />
							) : item.source === "github-issue" ? (
								<LuGithub className="size-3" />
							) : (
								<LuCircleDot className="size-3" />
							)}
							<span className="font-mono">{item.sourceKey ?? "Manual"}</span>
							<span aria-hidden="true">·</span>
							<span className="truncate">
								{item.metadata.project ?? "Superset Factory"}
							</span>
						</div>
						<h2 className="mt-2 text-sm font-semibold leading-snug text-foreground">
							{item.title}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close work inspector"
						className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<LuPanelRightClose className="size-4" />
					</button>
				</div>

				{stage !== "done" && (
					<div className="mt-3 flex items-center gap-2 rounded-md bg-primary/[0.08] px-2.5 py-2 text-xs font-medium text-primary">
						<span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
						{item.metadata.decision ?? "Needs your decision"}
					</div>
				)}
			</header>

			<nav
				aria-label="Work item details"
				className="flex h-9 shrink-0 items-end gap-4 border-b border-border px-4"
			>
				{(["plan", "activity", "checks"] as const).map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => setTab(value)}
						className={cn(
							"relative h-full text-xs capitalize text-muted-foreground transition-colors hover:text-foreground",
							tab === value &&
								"font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
						)}
					>
						{value}
					</button>
				))}
			</nav>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{tab === "plan" && (
					<div className="space-y-5">
						<section>
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{getFactoryStageLabel(stage)} brief
							</h3>
							<p className="mt-2 select-text cursor-text text-xs leading-relaxed text-muted-foreground">
								{item.metadata.description ??
									"Factory is carrying this request through the delivery workflow with its context and evidence attached."}
							</p>
						</section>

						<section>
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Plan
							</h3>
							<ol className="mt-3 space-y-3">
								{plan.map((step) => (
									<li
										key={step.label}
										className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground"
									>
										<PlanStatusIcon status={step.status} />
										<span
											className={cn(
												step.status === "pending" && "text-muted-foreground",
											)}
										>
											{step.label}
										</span>
									</li>
								))}
							</ol>
						</section>

						{item.metadata.branch && (
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Worktree
								</h3>
								<button
									type="button"
									onClick={() => {
										void navigator.clipboard.writeText(
											item.metadata.branch ?? "",
										);
										toast.success("Branch copied");
									}}
									className="mt-2 flex max-w-full items-center gap-2 rounded bg-muted px-2 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
								>
									<LuGitBranch className="size-3 shrink-0" />
									<span className="truncate">{item.metadata.branch}</span>
									<LuCopy className="size-3 shrink-0" />
								</button>
							</section>
						)}

						{item.metadata.diff && (
							<section>
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Diff
								</h3>
								<div className="mt-2 flex items-center gap-3 rounded-md border border-border/70 px-3 py-2 font-mono text-xs tabular-nums">
									<span className="text-emerald-700 dark:text-emerald-400">
										+{item.metadata.diff.additions}
									</span>
									<span className="text-red-600 dark:text-red-400">
										−{item.metadata.diff.deletions}
									</span>
									<span className="text-muted-foreground">
										{item.metadata.diff.files} files changed
									</span>
								</div>
							</section>
						)}
					</div>
				)}

				{tab === "activity" && (
					<ol className="space-y-0">
						{item.stageHistory.toReversed().map((entry, index, history) => (
							<li
								key={`${entry.stage}-${entry.enteredAt}`}
								className="flex gap-3"
							>
								<div className="flex flex-col items-center">
									<span
										className={cn(
											"mt-0.5 flex size-5 items-center justify-center rounded-full border bg-background",
											index === 0
												? "border-primary text-primary"
												: "border-border text-muted-foreground",
										)}
									>
										{entry.by.includes("agent") ||
										["triage", "planner", "builder", "reviewer"].includes(
											entry.by,
										) ? (
											<LuBot className="size-3" />
										) : (
											<LuPlay className="size-2.5" />
										)}
									</span>
									{index < history.length - 1 && (
										<span className="h-10 w-px bg-border" />
									)}
								</div>
								<div className="min-w-0 pb-5">
									<p className="text-xs font-medium text-foreground">
										Entered {getFactoryStageLabel(entry.stage as FactoryStage)}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{entry.by} · {item.metadata.age ?? "now"}
									</p>
								</div>
							</li>
						))}
					</ol>
				)}

				{tab === "checks" && (
					<div>
						{checks ? (
							<div className="space-y-3">
								<div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2.5">
									<span className="flex items-center gap-2 text-xs text-foreground">
										<LuCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
										Passing
									</span>
									<span className="text-xs tabular-nums text-muted-foreground">
										{checks.passed}
									</span>
								</div>
								<div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2.5">
									<span className="flex items-center gap-2 text-xs text-foreground">
										<LuX className="size-3.5 text-red-600 dark:text-red-400" />
										Failing
									</span>
									<span className="text-xs tabular-nums text-muted-foreground">
										{checks.failed}
									</span>
								</div>
								<p className="select-text cursor-text text-xs leading-relaxed text-muted-foreground">
									Factory will not advance this work item while a required check
									is failing. Open the workspace to inspect logs and repair the
									run.
								</p>
							</div>
						) : (
							<p className="select-text cursor-text text-xs leading-relaxed text-muted-foreground">
								Checks appear here when a builder opens a pull request.
								Repository gates remain the source of truth.
							</p>
						)}
					</div>
				)}
			</div>

			{action && (
				<footer className="space-y-2 border-t border-border p-4">
					<Button
						className="w-full"
						disabled={pending}
						onClick={handlePrimaryAction}
					>
						{pending ? "Moving work…" : action}
					</Button>
					{item.metadata.workspaceId &&
						stage !== "execute" &&
						(stage !== "review" || (checks?.failed ?? 0) === 0) && (
							<Button
								variant="outline"
								className="w-full"
								onClick={onOpenWorkspace}
							>
								Open workspace
								<LuExternalLink className="size-3.5" />
							</Button>
						)}
				</footer>
			)}
		</aside>
	);
}
