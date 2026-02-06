import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiChevronDown } from "react-icons/hi2";
import { LuGitPullRequest, LuLoaderCircle } from "react-icons/lu";
import { VscGitMerge } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { usePRStatus } from "renderer/screens/main/hooks";

interface PRButtonProps {
	workspaceId?: string;
	worktreePath: string;
	onRefresh: () => void;
}

export function PRButton({
	workspaceId,
	worktreePath,
	onRefresh,
}: PRButtonProps) {
	const { pr, isLoading } = usePRStatus({
		workspaceId,
		refetchInterval: 10000,
	});

	const mergePRMutation = electronTrpc.changes.mergePR.useMutation({
		onSuccess: () => {
			toast.success("PR merged successfully");
			onRefresh();
		},
		onError: (error) => toast.error(`Merge failed: ${error.message}`),
	});

	const createPRMutation = electronTrpc.changes.createPR.useMutation({
		onSuccess: () => {
			toast.success("Opening GitHub...");
			onRefresh();
		},
		onError: (error) => toast.error(`Failed: ${error.message}`),
	});

	const handleMergePR = (strategy: "merge" | "squash" | "rebase") =>
		mergePRMutation.mutate({ worktreePath, strategy });

	if (isLoading) {
		return (
			<LuLoaderCircle className="w-4 h-4 animate-spin text-muted-foreground" />
		);
	}

	if (!pr) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="flex items-center ml-auto hover:opacity-80 transition-opacity disabled:opacity-50"
						onClick={() => createPRMutation.mutate({ worktreePath })}
						disabled={createPRMutation.isPending}
					>
						{createPRMutation.isPending ? (
							<LuLoaderCircle className="w-4 h-4 animate-spin text-muted-foreground" />
						) : (
							<LuGitPullRequest className="w-4 h-4 text-muted-foreground" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Create Pull Request</TooltipContent>
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
		<div className="flex items-center ml-auto rounded border border-border overflow-hidden">
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
						disabled={mergePRMutation.isPending}
					>
						<HiChevronDown className="size-3 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
						Merge
					</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => handleMergePR("squash")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Squash and merge
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("merge")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Create merge commit
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleMergePR("rebase")}
						className="text-xs"
						disabled={mergePRMutation.isPending}
					>
						<VscGitMerge className="size-3.5" />
						Rebase and merge
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
