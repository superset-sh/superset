import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { V2WorktreeLocationPicker } from "renderer/routes/_authenticated/settings/components/V2WorktreeLocationPicker";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "renderer/routes/_authenticated/settings/components/WorktreeLocationPicker";

export function UserWorktreeLocationSection() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const utils = electronTrpc.useUtils();
	const defaultWorktreePath = useDefaultWorktreePath();

	const { data: v1WorktreeBaseDir, isLoading: isV1WorktreeBaseDirLoading } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery(undefined, {
			enabled: !isV2CloudEnabled,
		});
	const setV1WorktreeBaseDir =
		electronTrpc.settings.setWorktreeBaseDir.useMutation({
			onMutate: async ({ path }) => {
				await utils.settings.getWorktreeBaseDir.cancel();
				const previous = utils.settings.getWorktreeBaseDir.getData();
				utils.settings.getWorktreeBaseDir.setData(undefined, path);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getWorktreeBaseDir.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getWorktreeBaseDir.invalidate();
			},
		});

	const v2QueryKey = ["settings", "git", "worktree-location", activeHostUrl];
	const v2SettingsQuery = useQuery({
		queryKey: v2QueryKey,
		enabled: isV2CloudEnabled && Boolean(activeHostUrl),
		queryFn: async () => {
			if (!activeHostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.worktreeLocation.get.query();
		},
	});
	const setV2WorktreeBaseDir = useMutation({
		mutationFn: async (path: string | null) => {
			if (!activeHostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.worktreeLocation.set.mutate({ path });
		},
		onSuccess: (data, path) => {
			queryClient.setQueryData(v2QueryKey, data);
			toast.success(
				path ? "Worktree location updated" : "Worktree location reset",
			);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : String(err));
		},
	});

	return (
		<div className="space-y-0.5">
			<Label className="text-sm font-medium">Worktree location</Label>
			<p className="text-xs text-muted-foreground">
				User-level base directory for new worktrees
			</p>
			{isV2CloudEnabled ? (
				<V2WorktreeLocationPicker
					currentPath={v2SettingsQuery.data?.worktreeBaseDir ?? null}
					fallbackPath={
						v2SettingsQuery.data?.defaultWorktreeBaseDir ?? defaultWorktreePath
					}
					hostUrl={activeHostUrl}
					hostName="this device"
					isRemoteTarget={false}
					disabled={
						!activeHostUrl ||
						v2SettingsQuery.isLoading ||
						setV2WorktreeBaseDir.isPending
					}
					browseTitle="Select default worktree location"
					onSelect={(path) => setV2WorktreeBaseDir.mutate(path)}
					onReset={() => setV2WorktreeBaseDir.mutate(null)}
				/>
			) : (
				<WorktreeLocationPicker
					currentPath={v1WorktreeBaseDir}
					defaultPathLabel={`Default (${defaultWorktreePath})`}
					defaultBrowsePath={v1WorktreeBaseDir}
					disabled={
						isV1WorktreeBaseDirLoading || setV1WorktreeBaseDir.isPending
					}
					onSelect={(path) => setV1WorktreeBaseDir.mutate({ path })}
					onReset={() => setV1WorktreeBaseDir.mutate({ path: null })}
				/>
			)}
		</div>
	);
}
