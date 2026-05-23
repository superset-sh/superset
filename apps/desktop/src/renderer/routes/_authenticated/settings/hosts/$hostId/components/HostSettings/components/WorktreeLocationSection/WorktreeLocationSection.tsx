import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { V2WorktreeLocationPicker } from "../../../../../../components/V2WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	isOnline: boolean;
	canEdit: boolean;
}

export function WorktreeLocationSection({
	hostUrl,
	hostName,
	isRemoteTarget,
	isOnline,
	canEdit,
}: WorktreeLocationSectionProps) {
	const queryClient = useQueryClient();
	const queryKey = ["host-settings", "worktree-location", hostUrl] as const;

	const settingsQuery = useQuery({
		queryKey,
		enabled: Boolean(hostUrl && isOnline),
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.worktreeLocation.get.query();
		},
	});

	const setLocation = useMutation({
		mutationFn: async (path: string | null) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.worktreeLocation.set.mutate({ path });
		},
		onSuccess: (data, path) => {
			queryClient.setQueryData(queryKey, data);
			toast.success(
				path ? "Worktree location updated" : "Worktree location reset",
			);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : String(err));
		},
	});

	const disabled =
		!canEdit ||
		!isOnline ||
		!hostUrl ||
		settingsQuery.isLoading ||
		setLocation.isPending;

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">Worktrees</h3>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Default location for new worktree workspaces on this host.
				</p>
			</div>
			<V2WorktreeLocationPicker
				currentPath={settingsQuery.data?.worktreeBaseDir ?? null}
				fallbackPath={settingsQuery.data?.defaultWorktreeBaseDir ?? null}
				hostUrl={hostUrl}
				hostName={hostName}
				isRemoteTarget={isRemoteTarget}
				disabled={disabled}
				browseTitle="Select default worktree location"
				onSelect={(path) => setLocation.mutate(path)}
				onReset={() => setLocation.mutate(null)}
			/>
			{!canEdit ? (
				<p className="text-xs text-muted-foreground">
					Only host owners can change this location.
				</p>
			) : null}
		</section>
	);
}
