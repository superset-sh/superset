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
	VscArrowDown,
	VscArrowUp,
	VscCheck,
	VscChevronDown,
	VscLinkExternal,
	VscRefresh,
	VscSync,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateOrOpenPR } from "renderer/screens/main/hooks";
import { getPrimaryAction } from "./utils/getPrimaryAction";

interface CommitInputProps {
	worktreePath: string;
	hasStagedChanges: boolean;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	hasExistingPR: boolean;
	canCreatePR: boolean;
	shouldAutoCreatePRAfterPublish: boolean;
	prUrl?: string;
	onRefresh: () => void;
}

export function CommitInput({
	worktreePath,
	hasStagedChanges,
	pushCount,
	pullCount,
	hasUpstream,
	hasExistingPR,
	canCreatePR,
	shouldAutoCreatePRAfterPublish,
	prUrl,
	onRefresh,
}: CommitInputProps) {
	const [commitMessage, setCommitMessage] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const commitMutation = electronTrpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success("Committed");
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) => toast.error(`Commit failed: ${error.message}`),
	});

	const pushMutation = electronTrpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success("Pushed");
			onRefresh();
		},
		onError: (error) => toast.error(`Push failed: ${error.message}`),
	});

	const pullMutation = electronTrpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success("Pulled");
			onRefresh();
		},
		onError: (error) => toast.error(`Pull failed: ${error.message}`),
	});

	const syncMutation = electronTrpc.changes.sync.useMutation({
		onSuccess: () => {
			toast.success("Synced");
			onRefresh();
		},
		onError: (error) => toast.error(`Sync failed: ${error.message}`),
	});

	const { createOrOpenPR, isPending: isCreateOrOpenPRPending } =
		useCreateOrOpenPR({
			worktreePath,
			onSuccess: onRefresh,
		});

	const fetchMutation = electronTrpc.changes.fetch.useMutation({
		onSuccess: () => {
			toast.success("Fetched");
			onRefresh();
		},
		onError: (error) => toast.error(`Fetch failed: ${error.message}`),
	});

	const isPending =
		commitMutation.isPending ||
		pushMutation.isPending ||
		pullMutation.isPending ||
		syncMutation.isPending ||
		isCreateOrOpenPRPending ||
		fetchMutation.isPending;

	const canCommit = hasStagedChanges && commitMessage.trim();

	const handleCommit = () => {
		if (!canCommit) return;
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	const handlePush = () => {
		const isPublishing = !hasUpstream;
		pushMutation.mutate(
			{ worktreePath, setUpstream: true },
			{
				onSuccess: () => {
					if (
						isPublishing &&
						!hasExistingPR &&
						shouldAutoCreatePRAfterPublish
					) {
						createOrOpenPR();
					}
				},
			},
		);
	};
	const handlePull = () => pullMutation.mutate({ worktreePath });
	const handleSync = () => syncMutation.mutate({ worktreePath });
	const handleFetch = () => fetchMutation.mutate({ worktreePath });
	const handleFetchAndPull = () => {
		fetchMutation.mutate(
			{ worktreePath },
			{ onSuccess: () => pullMutation.mutate({ worktreePath }) },
		);
	};
	const handleCreatePR = () => {
		if (!canCreatePR) return;
		createOrOpenPR();
	};
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

	const primaryAction = getPrimaryAction({
		canCommit: Boolean(canCommit),
		hasStagedChanges,
		isPending,
		pushCount,
		pullCount,
		hasUpstream,
		hasExistingPR,
	});

	const primary = {
		...primaryAction,
		icon:
			primaryAction.action === "commit" ? (
				<VscCheck className="size-4" />
			) : primaryAction.action === "sync" ? (
				<VscSync className="size-4" />
			) : primaryAction.action === "pull" ? (
				<VscArrowDown className="size-4" />
			) : (
				<VscArrowUp className="size-4" />
			),
		handler:
			primaryAction.action === "commit"
				? handleCommit
				: primaryAction.action === "sync"
					? handleSync
					: primaryAction.action === "pull"
						? handlePull
						: handlePush,
	};

	const countBadge =
		pushCount > 0 || pullCount > 0
			? `${pullCount > 0 ? pullCount : ""}${pullCount > 0 && pushCount > 0 ? "/" : ""}${pushCount > 0 ? pushCount : ""}`
			: null;

	return (
		<div className="flex flex-col gap-1.5 px-2 py-2">
			<Textarea
				placeholder="Commit message"
				value={commitMessage}
				onChange={(e) => setCommitMessage(e.target.value)}
				className="min-h-[52px] resize-none text-[10px] bg-background"
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						(e.metaKey || e.ctrlKey) &&
						!primary.disabled
					) {
						e.preventDefault();
						primary.handler();
					}
				}}
			/>
			<ButtonGroup className="w-full">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="flex-1 gap-1.5 h-7 text-xs"
							onClick={primary.handler}
							disabled={primary.disabled}
						>
							{primary.icon}
							<span>{primary.label}</span>
							{countBadge && (
								<span className="text-[10px] opacity-70">{countBadge}</span>
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
							disabled={isPending}
							className="h-7 px-1.5"
						>
							<VscChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48 text-xs">
						<DropdownMenuItem
							onClick={handleCommit}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscCheck className="size-3.5" />
							Commit
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCommitAndPush}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscArrowUp className="size-3.5" />
							Commit & Push
						</DropdownMenuItem>
						{!hasExistingPR && canCreatePR && (
							<DropdownMenuItem
								onClick={handleCommitPushAndCreatePR}
								disabled={!canCommit}
								className="text-xs"
							>
								<VscLinkExternal className="size-3.5" />
								Commit, Push & Create PR
							</DropdownMenuItem>
						)}

						<DropdownMenuSeparator />

						<DropdownMenuItem
							onClick={handlePush}
							disabled={pushCount === 0 && hasUpstream}
							className="text-xs"
						>
							<VscArrowUp className="size-3.5" />
							<span className="flex-1">
								{hasUpstream || hasExistingPR ? "Push" : "Publish Branch"}
							</span>
							{pushCount > 0 && (
								<span className="text-[10px] text-muted-foreground">
									{pushCount}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handlePull}
							disabled={pullCount === 0}
							className="text-xs"
						>
							<VscArrowDown className="size-3.5" />
							<span className="flex-1">Pull</span>
							{pullCount > 0 && (
								<span className="text-[10px] text-muted-foreground">
									{pullCount}
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleSync}
							disabled={pushCount === 0 && pullCount === 0}
							className="text-xs"
						>
							<VscSync className="size-3.5" />
							Sync
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleFetch} className="text-xs">
							<VscRefresh className="size-3.5" />
							Fetch
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleFetchAndPull} className="text-xs">
							<VscRefresh className="size-3.5" />
							Fetch & Pull
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						{hasExistingPR ? (
							<DropdownMenuItem onClick={handleOpenPR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								Open Pull Request
							</DropdownMenuItem>
						) : canCreatePR ? (
							<DropdownMenuItem onClick={handleCreatePR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								Create Pull Request
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</ButtonGroup>
		</div>
	);
}
