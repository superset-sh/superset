import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { LuUndo2 } from "react-icons/lu";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";

type SectionKind = "unstaged" | "staged";

interface ChangesSectionProps {
	title: string;
	count: number;
	defaultOpen?: boolean;
	stagingActions?: { kind: SectionKind; workspaceId: string };
	children: ReactNode;
}

export function ChangesSection({
	title,
	count,
	defaultOpen = true,
	stagingActions,
	children,
}: ChangesSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const [showConfirm, setShowConfirm] = useState(false);
	const utils = workspaceTrpc.useUtils();

	const invalidate = () => {
		if (!stagingActions) return;
		void utils.git.getStatus.invalidate({
			workspaceId: stagingActions.workspaceId,
		});
		void utils.git.getDiff.invalidate({
			workspaceId: stagingActions.workspaceId,
		});
	};

	const discardAllUnstaged = workspaceTrpc.git.discardAllUnstaged.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error("Couldn't discard unstaged changes", {
				description: err.message,
			});
		},
	});
	const discardAllStaged = workspaceTrpc.git.discardAllStaged.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error("Couldn't discard staged changes", {
				description: err.message,
			});
		},
	});
	const stageAll = workspaceTrpc.git.stageAll.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error("Couldn't stage changes", { description: err.message });
		},
	});
	const unstageAll = workspaceTrpc.git.unstageAll.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error("Couldn't unstage changes", { description: err.message });
		},
	});

	if (count === 0) return null;

	const runDiscardAll = () => {
		if (!stagingActions) return;
		const { kind, workspaceId } = stagingActions;
		if (kind === "unstaged") {
			discardAllUnstaged.mutate({ workspaceId });
		} else {
			discardAllStaged.mutate({ workspaceId });
		}
	};

	const runStagingToggle = () => {
		if (!stagingActions) return;
		const { kind, workspaceId } = stagingActions;
		if (kind === "unstaged") {
			stageAll.mutate({ workspaceId });
		} else {
			unstageAll.mutate({ workspaceId });
		}
	};

	const dialogCopy =
		stagingActions?.kind === "unstaged"
			? {
					title: "Discard all unstaged changes?",
					description:
						"This will revert all unstaged modifications and delete untracked files. This cannot be undone.",
				}
			: {
					title: "Discard all staged changes?",
					description:
						"This will unstage and revert all staged changes. Staged new files will be deleted. This cannot be undone.",
				};

	const isUnstaged = stagingActions?.kind === "unstaged";
	const stagingToggleLabel = isUnstaged ? "Stage all" : "Unstage all";
	const StagingToggleIcon = isUnstaged ? Plus : Minus;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="flex items-center">
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-accent/30">
					<ChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
							open && "rotate-90",
						)}
					/>
					<span className="truncate font-medium">{title}</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{count}
					</span>
				</CollapsibleTrigger>
				{stagingActions && (
					<div className="flex shrink-0 items-center gap-0.5 pr-1.5">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`Discard all ${stagingActions.kind} changes`}
									onClick={() => setShowConfirm(true)}
									className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
								>
									<LuUndo2 className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								Discard all {stagingActions.kind}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={stagingToggleLabel}
									onClick={runStagingToggle}
									className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									<StagingToggleIcon className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{stagingToggleLabel}
							</TooltipContent>
						</Tooltip>
					</div>
				)}
			</div>
			<CollapsibleContent>{children}</CollapsibleContent>
			{stagingActions && (
				<DiscardConfirmDialog
					open={showConfirm}
					onOpenChange={setShowConfirm}
					title={dialogCopy.title}
					description={dialogCopy.description}
					onConfirm={() => {
						setShowConfirm(false);
						runDiscardAll();
					}}
				/>
			)}
		</Collapsible>
	);
}
