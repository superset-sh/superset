import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	HiOutlineCloud,
	HiOutlineCloudArrowUp,
	HiOutlineExclamationTriangle,
	HiOutlineGlobeAlt,
	HiOutlineLink,
	HiOutlinePlus,
} from "react-icons/hi2";
import { LuGitBranch, LuLoader, LuUnlink } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CloudWorkspaceButtonProps {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	cloudWorkspaceId: string | null;
}

export function CloudWorkspaceButton({
	workspaceId,
	workspaceName,
	branch,
	cloudWorkspaceId,
}: CloudWorkspaceButtonProps) {
	const [isLinking, setIsLinking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { data: session } = authClient.useSession();
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const organizationId = session?.session?.activeOrganizationId;

	const { data: repoInfo } = electronTrpc.workspaces.getRepoInfo.useQuery(
		{ id: workspaceId },
		{ enabled: !cloudWorkspaceId },
	);

	const { data: cloudWorkspace, isLoading: isLoadingCloudStatus } = useQuery({
		queryKey: ["cloudWorkspace", cloudWorkspaceId],
		queryFn: () =>
			apiTrpcClient.cloudWorkspace.byId.query(cloudWorkspaceId as string),
		enabled: !!cloudWorkspaceId,
		staleTime: 30_000,
	});

	const isCloudDeleted = cloudWorkspace?.deletedAt != null;

	const { data: matchingWorkspaces } = useQuery({
		queryKey: [
			"cloudWorkspace",
			"matching",
			organizationId,
			repoInfo?.repoOwner,
			repoInfo?.repoName,
		],
		queryFn: () =>
			apiTrpcClient.cloudWorkspace.findMatching.query({
				organizationId: organizationId ?? "",
				repoOwner: repoInfo?.repoOwner ?? "",
				repoName: repoInfo?.repoName ?? "",
			}),
		enabled:
			!!organizationId &&
			!!repoInfo?.hasRemote &&
			!!repoInfo.repoOwner &&
			!!repoInfo.repoName &&
			!cloudWorkspaceId,
		staleTime: 30_000,
	});

	const linkToCloudMutation = electronTrpc.workspaces.linkToCloud.useMutation({
		onSuccess: () => {
			utils.workspaces.get.invalidate({ id: workspaceId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const unlinkFromCloudMutation =
		electronTrpc.workspaces.unlinkFromCloud.useMutation({
			onSuccess: () => {
				utils.workspaces.get.invalidate({ id: workspaceId });
				utils.workspaces.getAllGrouped.invalidate();
			},
		});

	const handleCreateAndLink = async () => {
		if (!organizationId || !repoInfo?.hasRemote) {
			return;
		}

		setIsLinking(true);
		setError(null);

		try {
			const result = await apiTrpcClient.cloudWorkspace.create.mutate({
				organizationId,
				repoOwner: repoInfo.repoOwner,
				repoName: repoInfo.repoName,
				repoUrl: repoInfo.repoUrl,
				name: workspaceName,
				branch,
			});

			await linkToCloudMutation.mutateAsync({
				id: workspaceId,
				cloudWorkspaceId: result.cloudWorkspace.id,
			});

			queryClient.invalidateQueries({
				queryKey: ["cloudWorkspace", "matching"],
			});
		} catch (err) {
			console.error("[cloud-workspace] Failed to create and link:", err);
			setError(err instanceof Error ? err.message : "Failed to link to cloud");
		} finally {
			setIsLinking(false);
		}
	};

	const handleLinkToExisting = async (existingCloudWorkspaceId: string) => {
		setIsLinking(true);
		setError(null);

		try {
			await linkToCloudMutation.mutateAsync({
				id: workspaceId,
				cloudWorkspaceId: existingCloudWorkspaceId,
			});
		} catch (err) {
			console.error("[cloud-workspace] Failed to link:", err);
			setError(err instanceof Error ? err.message : "Failed to link to cloud");
		} finally {
			setIsLinking(false);
		}
	};

	const handleOpenInWeb = () => {
		if (cloudWorkspaceId) {
			window.open(
				`${env.NEXT_PUBLIC_WEB_URL}/cloud/workspace/${cloudWorkspaceId}`,
				"_blank",
			);
		}
	};

	const handleUnlink = () => {
		unlinkFromCloudMutation.mutate({ id: workspaceId });
	};

	if (cloudWorkspaceId) {
		if (isLoadingCloudStatus) {
			return (
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-2 rounded border border-border/60 bg-secondary/50 text-xs font-medium text-muted-foreground cursor-default"
				>
					<LuLoader className="h-3.5 w-3.5 animate-spin" />
					<span>Cloud</span>
				</button>
			);
		}

		if (isCloudDeleted) {
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="no-drag flex items-center gap-1.5 h-6 px-2 rounded border border-destructive/60 bg-destructive/10 hover:bg-destructive/20 hover:border-destructive transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-destructive text-xs font-medium text-destructive"
						>
							<HiOutlineExclamationTriangle className="h-3.5 w-3.5" />
							<span>Deleted</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							Cloud workspace was deleted
						</div>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={handleUnlink}>
							<LuUnlink className="h-4 w-4" />
							<span>Unlink</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="no-drag flex items-center gap-1.5 h-6 px-2 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring text-xs font-medium"
					>
						<HiOutlineCloud className="h-3.5 w-3.5 text-green-500" />
						<span>Cloud</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onSelect={handleOpenInWeb}>
						<HiOutlineGlobeAlt className="h-4 w-4" />
						<span>Open in web</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={handleUnlink}>
						<LuUnlink className="h-4 w-4" />
						<span>Unlink</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	if (!repoInfo?.hasRemote) {
		return null;
	}

	const hasMatchingWorkspaces =
		matchingWorkspaces && matchingWorkspaces.length > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-2 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring text-xs font-medium"
					disabled={isLinking}
				>
					{isLinking ? (
						<LuLoader className="h-3.5 w-3.5 animate-spin" />
					) : (
						<HiOutlineCloudArrowUp className="h-3.5 w-3.5" />
					)}
					<span>{isLinking ? "Linking..." : "Link to Cloud"}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				{hasMatchingWorkspaces && (
					<>
						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
							Existing workspaces
						</DropdownMenuLabel>
						{matchingWorkspaces.map((ws) => (
							<DropdownMenuItem
								key={ws.id}
								onSelect={() => handleLinkToExisting(ws.id)}
								disabled={isLinking || !organizationId}
							>
								<HiOutlineLink className="h-4 w-4" />
								<div className="flex flex-col gap-0.5 min-w-0">
									<span className="truncate">{ws.name}</span>
									<span className="text-xs text-muted-foreground flex items-center gap-1">
										<LuGitBranch className="h-3 w-3" />
										{ws.branch}
									</span>
								</div>
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					onSelect={handleCreateAndLink}
					disabled={isLinking || !organizationId}
				>
					<HiOutlinePlus className="h-4 w-4" />
					<div className="flex flex-col gap-0.5">
						<span>Create new workspace</span>
						<span className="text-xs text-muted-foreground">
							{repoInfo.repoOwner}/{repoInfo.repoName} · {branch}
						</span>
					</div>
				</DropdownMenuItem>
				{error && (
					<div className="px-2 py-1.5 text-xs text-destructive">{error}</div>
				)}
				{!organizationId && (
					<div className="px-2 py-1.5 text-xs text-muted-foreground">
						Please select an organization first
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
