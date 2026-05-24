import {
	type BranchPrefixMode,
	resolveBranchPrefix,
} from "@superset/shared/workspace-launch";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { BranchPrefixControl } from "../../../components/BranchPrefixControl";

const BRANCH_PREFIX_QUERY_KEY = ["host-branch-prefix"] as const;

/**
 * v2 Git settings — the host-wide branch-prefix default. Projects without
 * their own override inherit this. The v1 equivalent lives in `GitSettings`.
 */
export function V2GitSettings() {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const queryClient = useQueryClient();

	const branchPrefixQuery = useQuery({
		queryKey: [...BRANCH_PREFIX_QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.branchPrefix.get.query();
		},
	});

	const gitInfoQuery = useQuery({
		queryKey: ["host-git-info", activeHostUrl] as const,
		enabled: !!activeHostUrl,
		staleTime: 5 * 60 * 1000,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.branchPrefix.gitInfo.query();
		},
	});

	const mode: BranchPrefixMode = branchPrefixQuery.data?.mode ?? "none";
	const customPrefix = branchPrefixQuery.data?.customPrefix ?? null;

	const setMutation = useMutation({
		mutationFn: (vars: {
			mode: BranchPrefixMode;
			customPrefix: string | null;
		}) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "update the branch prefix",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.branchPrefix.set.mutate(vars);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: BRANCH_PREFIX_QUERY_KEY,
			});
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to update branch prefix",
			),
	});

	const previewPrefix =
		resolveBranchPrefix({
			mode,
			customPrefix,
			authorPrefix: gitInfoQuery.data?.authorName,
			githubUsername: gitInfoQuery.data?.githubUsername,
		}) ||
		(mode === "author" ? "author-name" : mode === "github" ? "username" : null);

	const controlsDisabled =
		!activeHostUrl || branchPrefixQuery.isLoading || setMutation.isPending;

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Git &amp; worktrees</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure git branch behavior for new workspaces
				</p>
			</div>

			<div className="flex items-center justify-between">
				<div className="space-y-0.5">
					<Label className="text-sm font-medium">Branch prefix</Label>
					<p className="text-xs text-muted-foreground">
						Group new branches under a folder. Projects can override this.{" "}
						<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
							{previewPrefix ? `${previewPrefix}/branch-name` : "branch-name"}
						</code>
					</p>
				</div>
				<BranchPrefixControl
					mode={mode}
					customPrefix={customPrefix}
					disabled={controlsDisabled}
					onChange={(next) =>
						// Host-wide control never produces null mode (no "default" option).
						setMutation.mutate({
							mode: next.mode ?? "none",
							customPrefix: next.customPrefix,
						})
					}
				/>
			</div>
		</div>
	);
}
