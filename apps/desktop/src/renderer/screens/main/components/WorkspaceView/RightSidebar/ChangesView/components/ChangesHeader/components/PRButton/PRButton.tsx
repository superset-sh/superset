import type { GitHubStatus } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	VscChevronDown,
	VscClose,
	VscGitMerge,
	VscGitPullRequest,
	VscLoading,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { useCreateOrOpenPR } from "renderer/screens/main/hooks";

interface PRButtonProps {
	pr: GitHubStatus["pr"] | null;
	isLoading: boolean;
	canCreatePR: boolean;
	createPRBlockedReason: string | null;
	worktreePath: string;
	onRefresh: () => void;
}

export function PRButton({
	pr,
	isLoading,
	canCreatePR,
	createPRBlockedReason,
	worktreePath,
	onRefresh,
}: PRButtonProps) {
	const mergePRMutation = electronTrpc.changes.mergePR.useMutation({
		onMutate: () => {
			const toastId = toast.loading("Merging PR...");
			return { toastId };
		},
		onSuccess: (_data, _variables, context) => {
			toast.success("PR merged successfully", { id: context?.toastId });
			onRefresh();
		},
		onError: (error, _variables, context) =>
			toast.error(`Merge failed: ${error.message}`, {
				id: context?.toastId,
			}),
	});

	const closePRMutation = electronTrpc.changes.closePR.useMutation({
		onMutate: () => {
			const toastId = toast.loading("Closing PR...");
			return { toastId };
		},
		onSuccess: (_data, _variables, context) => {
			toast.success("PR closed", { id: context?.toastId });
			onRefresh();
		},
		onError: (error, _variables, context) =>
			toast.error(`Close failed: ${error.message}`, {
				id: context?.toastId,
			}),
	});

	const { createOrOpenPR, isPending: isCreateOrOpenPRPending } =
		useCreateOrOpenPR({
			worktreePath,
			onSuccess: onRefresh,
		});

	const isCreatePending = isCreateOrOpenPRPending;
	const isActioning = mergePRMutation.isPending || closePRMutation.isPending;

	const handleCreatePR = () => createOrOpenPR();

	const handleMergePR = (strategy: "merge" | "squash" | "rebase") =>
		mergePRMutation.mutate({ worktreePath, strategy });

	const handleClosePR = () => closePRMutation.mutate({ worktreePath });

	if (isLoading) {
		return (
			<VscLoading className="w-4 h-4 animate-spin text-muted-foreground" />
		);
	}

	if (!pr) {
		if (!canCreatePR) {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex items-center ml-auto text-muted-foreground/40">
							<VscGitPullRequest className="w-4 h-4" />
						</span>
					</TooltipTrigger>
					<TooltipContent side="top">
						{createPRBlockedReason ?? "Create Pull Request unavailable"}
					</TooltipContent>
				</Tooltip>
			);
		}

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="flex items-center ml-auto hover:opacity-80 transition-opacity disabled:opacity-50"
						onClick={handleCreatePR}
						disabled={isCreatePending}
					>
						{isCreatePending ? (
							<VscLoading className="w-4 h-4 animate-spin text-muted-foreground" />
						) : (
							<VscGitPullRequest className="w-4 h-4 text-muted-foreground" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="top">Create Pull Request</TooltipContent>
			</Tooltip>
		);
	}

	const canMerge = pr.state === "open";

	if (!canMerge) {
		return (
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 ml-auto hover:opacity-80 transition-opacity"
			>
				<PRIcon state={pr.state} className="w-4 h-4" />
				<span className="text-xs text-muted-foreground font-mono">
					#{pr.number}
				</span>
			</a>
		);
	}

	return (
		<div
			className="flex items-center ml-auto rounded border border-border overflow-hidden"
			aria-busy={isActioning}
		>
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-accent transition-colors"
			>
				<PRIcon state={pr.state} className="w-4 h-4" />
				<span className="text-xs text-muted-foreground font-mono">
					#{pr.number}
				</span>
			</a>
			<div className="w-px h-full bg-border" />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center px-1 py-0.5 hover:bg-accent transition-colors"
						disabled={isActioning}
						aria-label={
							isActioning ? "Processing pull request" : "Open merge options"
						}
					>
						{isActioning ? (
							<VscLoading className="size-3 animate-spin text-muted-foreground" />
						) : (
							<VscChevronDown className="size-3 text-muted-foreground" />
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
						Merge
					</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => handleMergePR("squash")}
						className="text-xs"
						disabled={isActioning}
					>
						<VscGitMerge className="size-3.5" />
						Squash and merge
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("merge")}
						className="text-xs"
						disabled={isActioning}
					>
						<VscGitMerge className="size-3.5" />
						Create merge commit
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("rebase")}
						className="text-xs"
						disabled={isActioning}
					>
						<VscGitMerge className="size-3.5" />
						Rebase and merge
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={handleClosePR}
						className="text-xs text-destructive"
						disabled={isActioning}
					>
						<VscClose className="size-3.5" />
						Close pull request
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
