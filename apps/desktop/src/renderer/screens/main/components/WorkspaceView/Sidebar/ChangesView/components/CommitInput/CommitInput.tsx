import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	HiArrowDown,
	HiArrowsUpDown,
	HiArrowTopRightOnSquare,
	HiArrowUp,
	HiCheck,
	HiChevronDown,
} from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

interface CommitInputProps {
	worktreePath: string;
	hasStagedChanges: boolean;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	hasExistingPR: boolean;
	prUrl?: string;
	onRefresh: () => void;
}

type GitAction = "commit" | "push" | "pull" | "sync";

export function CommitInput({
	worktreePath,
	hasStagedChanges,
	pushCount,
	pullCount,
	hasUpstream,
	hasExistingPR,
	prUrl,
	onRefresh,
}: CommitInputProps) {
	const [commitMessage, setCommitMessage] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const commitMutation = trpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success("Committed");
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) => toast.error(`Commit failed: ${error.message}`),
	});

	const pushMutation = trpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success("Pushed");
			onRefresh();
		},
		onError: (error) => toast.error(`Push failed: ${error.message}`),
	});

	const pullMutation = trpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success("Pulled");
			onRefresh();
		},
		onError: (error) => toast.error(`Pull failed: ${error.message}`),
	});

	const syncMutation = trpc.changes.sync.useMutation({
		onSuccess: () => {
			toast.success("Synced");
			onRefresh();
		},
		onError: (error) => toast.error(`Sync failed: ${error.message}`),
	});

	const createPRMutation = trpc.changes.createPR.useMutation({
		onSuccess: () => {
			toast.success("Opening GitHub...");
			onRefresh();
		},
		onError: (error) => toast.error(`Failed: ${error.message}`),
	});

	const isPending =
		commitMutation.isPending ||
		pushMutation.isPending ||
		pullMutation.isPending ||
		syncMutation.isPending ||
		createPRMutation.isPending;

	const canCommit = hasStagedChanges && commitMessage.trim();

	const handleCommit = () => {
		if (!canCommit) return;
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	const handlePush = () =>
		pushMutation.mutate({ worktreePath, setUpstream: true });
	const handlePull = () => pullMutation.mutate({ worktreePath });
	const handleSync = () => syncMutation.mutate({ worktreePath });
	const handleCreatePR = () => createPRMutation.mutate({ worktreePath });
	const handleOpenPR = () => prUrl && window.open(prUrl, "_blank");

	const handleCommitAndPush = () => {
		if (!canCommit) return;
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{ onSuccess: handlePush },
		);
	};

	const handleCommitPushAndCreatePR = () => {
		if (!canCommit) return;
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{
				onSuccess: () => {
					pushMutation.mutate(
						{ worktreePath, setUpstream: true },
						{ onSuccess: handleCreatePR },
					);
				},
			},
		);
	};

	// Determine primary action based on state
	const getPrimaryAction = (): {
		action: GitAction;
		label: string;
		icon: React.ReactNode;
		handler: () => void;
		disabled: boolean;
		tooltip: string;
	} => {
		if (canCommit) {
			return {
				action: "commit",
				label: "Commit",
				icon: <HiCheck className="size-4" />,
				handler: handleCommit,
				disabled: isPending,
				tooltip: "Commit staged changes",
			};
		}
		if (pushCount > 0 && pullCount > 0) {
			return {
				action: "sync",
				label: "Sync",
				icon: <HiArrowsUpDown className="size-4" />,
				handler: handleSync,
				disabled: isPending,
				tooltip: `Pull ${pullCount}, push ${pushCount}`,
			};
		}
		if (pushCount > 0) {
			return {
				action: "push",
				label: "Push",
				icon: <HiArrowUp className="size-4" />,
				handler: handlePush,
				disabled: isPending,
				tooltip: `Push ${pushCount} commit${pushCount !== 1 ? "s" : ""}`,
			};
		}
		if (pullCount > 0) {
			return {
				action: "pull",
				label: "Pull",
				icon: <HiArrowDown className="size-4" />,
				handler: handlePull,
				disabled: isPending,
				tooltip: `Pull ${pullCount} commit${pullCount !== 1 ? "s" : ""}`,
			};
		}
		// No upstream - show Publish Branch option
		if (!hasUpstream) {
			return {
				action: "push",
				label: "Publish Branch",
				icon: <HiArrowUp className="size-4" />,
				handler: handlePush,
				disabled: isPending,
				tooltip: "Publish branch to remote",
			};
		}
		return {
			action: "commit",
			label: "Commit",
			icon: <HiCheck className="size-4" />,
			handler: handleCommit,
			disabled: true,
			tooltip: hasStagedChanges ? "Enter a message" : "No staged changes",
		};
	};

	const primary = getPrimaryAction();

	// Format count badge
	const countBadge =
		pushCount > 0 || pullCount > 0
			? `${pullCount > 0 ? pullCount : ""}${pullCount > 0 && pushCount > 0 ? "/" : ""}${pushCount > 0 ? pushCount : ""}`
			: null;

	return (
		<div className="flex flex-col gap-2 p-3">
			<Textarea
				placeholder="Commit message"
				value={commitMessage}
				onChange={(e) => setCommitMessage(e.target.value)}
				className="min-h-[52px] rounded-sm resize-none text-sm shadow-none focus-visible:ring-0 focus-visible:border-border"
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) {
						e.preventDefault();
						handleCommit();
					}
				}}
			/>
			<ButtonGroup className="w-full">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="flex-1 gap-1.5 font-medium"
							onClick={primary.handler}
							disabled={primary.disabled}
						>
							{primary.icon}
							<span>{primary.label}</span>
							{countBadge && (
								<span className="text-xs text-muted-foreground">
									{countBadge}
								</span>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{primary.tooltip}</TooltipContent>
				</Tooltip>
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="px-2"
							disabled={isPending}
						>
							<HiChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onClick={handleCommit} disabled={!canCommit}>
							<HiCheck className="size-3.5" />
							Commit
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCommitAndPush}
							disabled={!canCommit}
						>
							<HiArrowUp className="size-3.5" />
							Commit & Push
						</DropdownMenuItem>
						{!hasExistingPR && (
							<DropdownMenuItem
								onClick={handleCommitPushAndCreatePR}
								disabled={!canCommit}
							>
								<HiArrowTopRightOnSquare className="size-3.5" />
								Commit, Push & Create PR
							</DropdownMenuItem>
						)}

						<DropdownMenuSeparator />

						<DropdownMenuItem
							onClick={handlePush}
							disabled={pushCount === 0 && hasUpstream}
						>
							<HiArrowUp className="size-3.5" />
							<span className="flex-1">
								{hasUpstream ? "Push" : "Publish Branch"}
							</span>
							{pushCount > 0 && (
								<span className="text-[11px] text-muted-foreground">
									{pushCount}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handlePull} disabled={pullCount === 0}>
							<HiArrowDown className="size-3.5" />
							<span className="flex-1">Pull</span>
							{pullCount > 0 && (
								<span className="text-[11px] text-muted-foreground">
									{pullCount}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleSync}
							disabled={pushCount === 0 && pullCount === 0}
						>
							<HiArrowsUpDown className="size-3.5" />
							Sync
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						{hasExistingPR ? (
							<DropdownMenuItem onClick={handleOpenPR}>
								<HiArrowTopRightOnSquare className="size-3.5" />
								Open Pull Request
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onClick={handleCreatePR}>
								<HiArrowTopRightOnSquare className="size-3.5" />
								Create Pull Request
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</ButtonGroup>
		</div>
	);
}
