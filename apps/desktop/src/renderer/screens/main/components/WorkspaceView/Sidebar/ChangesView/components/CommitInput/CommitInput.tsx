import { Button } from "@superset/ui/button";
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
	ahead: number;
	behind: number;
	branchExistsOnRemote: boolean;
	hasExistingPR: boolean;
	prUrl?: string;
	onRefresh: () => void;
}

export function CommitInput({
	worktreePath,
	hasStagedChanges,
	ahead,
	behind,
	branchExistsOnRemote,
	hasExistingPR,
	prUrl,
	onRefresh,
}: CommitInputProps) {
	const [commitMessage, setCommitMessage] = useState("");

	const commitMutation = trpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success("Changes committed successfully");
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) => {
			toast.error(`Failed to commit: ${error.message}`);
		},
	});

	const pushMutation = trpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success("Pushed successfully");
			onRefresh();
		},
		onError: (error) => {
			toast.error(`Failed to push: ${error.message}`);
		},
	});

	const pullMutation = trpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success("Pulled successfully");
			onRefresh();
		},
		onError: (error) => {
			toast.error(`Failed to pull: ${error.message}`);
		},
	});

	const syncMutation = trpc.changes.sync.useMutation({
		onSuccess: () => {
			toast.success("Synced successfully");
			onRefresh();
		},
		onError: (error) => {
			toast.error(`Failed to sync: ${error.message}`);
		},
	});

	const createPRMutation = trpc.changes.createPR.useMutation({
		onSuccess: (data) => {
			toast.success("PR created successfully");
			window.open(data.url, "_blank");
			onRefresh();
		},
		onError: (error) => {
			toast.error(`Failed to create PR: ${error.message}`);
		},
	});

	const isPending =
		commitMutation.isPending ||
		pushMutation.isPending ||
		pullMutation.isPending ||
		syncMutation.isPending ||
		createPRMutation.isPending;

	const handleCommit = () => {
		if (!commitMessage.trim()) {
			toast.error("Please enter a commit message");
			return;
		}
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	const handleCommitAndPush = () => {
		if (!commitMessage.trim()) {
			toast.error("Please enter a commit message");
			return;
		}
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{
				onSuccess: () => {
					pushMutation.mutate({
						worktreePath,
						setUpstream: !branchExistsOnRemote,
					});
				},
			},
		);
	};

	const handleCommitPushAndCreatePR = () => {
		if (!commitMessage.trim()) {
			toast.error("Please enter a commit message");
			return;
		}
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{
				onSuccess: () => {
					pushMutation.mutate(
						{ worktreePath, setUpstream: !branchExistsOnRemote },
						{
							onSuccess: () => {
								createPRMutation.mutate({
									worktreePath,
									title: commitMessage.trim().split("\n")[0],
								});
							},
						},
					);
				},
			},
		);
	};

	const handlePush = () => {
		pushMutation.mutate({ worktreePath, setUpstream: !branchExistsOnRemote });
	};

	const handlePull = () => {
		pullMutation.mutate({ worktreePath });
	};

	const handleSync = () => {
		syncMutation.mutate({ worktreePath });
	};

	const handleCreatePR = () => {
		const title = commitMessage.trim().split("\n")[0] || "New pull request";
		createPRMutation.mutate({ worktreePath, title });
	};

	const handleOpenPR = () => {
		if (prUrl) {
			window.open(prUrl, "_blank");
		}
	};

	const getMainButtonAction = (): {
		label: string;
		icon: React.ReactNode;
		action: () => void;
		disabled: boolean;
		tooltip: string;
	} => {
		if (hasStagedChanges && commitMessage.trim()) {
			return {
				label: "Commit",
				icon: <HiCheck className="w-4 h-4" />,
				action: handleCommit,
				disabled: isPending,
				tooltip: "Commit staged changes",
			};
		}
		if (ahead > 0 && behind > 0) {
			return {
				label: "Sync",
				icon: <HiArrowsUpDown className="w-4 h-4" />,
				action: handleSync,
				disabled: isPending,
				tooltip: `Sync: pull ${behind} commit${behind !== 1 ? "s" : ""}, push ${ahead} commit${ahead !== 1 ? "s" : ""}`,
			};
		}
		if (ahead > 0) {
			return {
				label: "Push",
				icon: <HiArrowUp className="w-4 h-4" />,
				action: handlePush,
				disabled: isPending,
				tooltip: `Push ${ahead} commit${ahead !== 1 ? "s" : ""}`,
			};
		}
		if (behind > 0) {
			return {
				label: "Pull",
				icon: <HiArrowDown className="w-4 h-4" />,
				action: handlePull,
				disabled: isPending,
				tooltip: `Pull ${behind} commit${behind !== 1 ? "s" : ""}`,
			};
		}
		return {
			label: "Commit",
			icon: <HiCheck className="w-4 h-4" />,
			action: handleCommit,
			disabled: isPending || !hasStagedChanges || !commitMessage.trim(),
			tooltip: hasStagedChanges
				? "Enter a commit message"
				: "No staged changes to commit",
		};
	};

	const mainButton = getMainButtonAction();

	return (
		<div className="flex flex-col gap-2 p-3 border-b border-border">
			<Textarea
				placeholder="Message"
				value={commitMessage}
				onChange={(e) => setCommitMessage(e.target.value)}
				className="min-h-[60px] resize-none text-sm bg-background"
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						if (hasStagedChanges && commitMessage.trim()) {
							handleCommit();
						}
					}
				}}
			/>
			<div className="flex gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="flex-1 gap-1.5"
							onClick={mainButton.action}
							disabled={mainButton.disabled}
						>
							{mainButton.icon}
							{mainButton.label}
							{(ahead > 0 || behind > 0) && (
								<span className="text-xs opacity-70 ml-1">
									{behind > 0 && `${behind}`}
									{behind > 0 && ahead > 0 && "/"}
									{ahead > 0 && `${ahead}`}
								</span>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{mainButton.tooltip}</TooltipContent>
				</Tooltip>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="px-2"
							disabled={isPending}
						>
							<HiChevronDown className="w-4 h-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem
							onClick={handleCommit}
							disabled={!hasStagedChanges || !commitMessage.trim()}
						>
							<HiCheck className="w-4 h-4 mr-2" />
							Commit
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCommitAndPush}
							disabled={!hasStagedChanges || !commitMessage.trim()}
						>
							<HiArrowUp className="w-4 h-4 mr-2" />
							Commit & Push
						</DropdownMenuItem>
						{!hasExistingPR && (
							<DropdownMenuItem
								onClick={handleCommitPushAndCreatePR}
								disabled={!hasStagedChanges || !commitMessage.trim()}
							>
								<HiArrowTopRightOnSquare className="w-4 h-4 mr-2" />
								Commit, Push & Create PR
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handlePush} disabled={ahead === 0}>
							<HiArrowUp className="w-4 h-4 mr-2" />
							Push
							{ahead > 0 && (
								<span className="ml-auto text-xs text-muted-foreground">
									{ahead}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handlePull} disabled={behind === 0}>
							<HiArrowDown className="w-4 h-4 mr-2" />
							Pull
							{behind > 0 && (
								<span className="ml-auto text-xs text-muted-foreground">
									{behind}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleSync}
							disabled={ahead === 0 && behind === 0}
						>
							<HiArrowsUpDown className="w-4 h-4 mr-2" />
							Sync
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{hasExistingPR ? (
							<DropdownMenuItem onClick={handleOpenPR}>
								<HiArrowTopRightOnSquare className="w-4 h-4 mr-2" />
								Open Pull Request
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								onClick={handleCreatePR}
								disabled={!branchExistsOnRemote && ahead === 0}
							>
								<HiArrowTopRightOnSquare className="w-4 h-4 mr-2" />
								Create Pull Request
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
