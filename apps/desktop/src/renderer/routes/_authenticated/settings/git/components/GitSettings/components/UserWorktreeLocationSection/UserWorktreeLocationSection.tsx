import { Label } from "@superset/ui/label";
import { useMemo, useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	HostSelect,
	type HostSelectOption,
} from "renderer/routes/_authenticated/settings/components/HostSelect";
import {
	useSetV2WorktreeBaseDir,
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "renderer/routes/_authenticated/settings/components/V2WorktreeLocationPicker";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "renderer/routes/_authenticated/settings/components/WorktreeLocationPicker";

export function UserWorktreeLocationSection() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	return isV2CloudEnabled ? <V2Body /> : <V1Body />;
}

function V1Body() {
	const utils = electronTrpc.useUtils();
	const defaultWorktreePath = useDefaultWorktreePath();

	const { data: worktreeBaseDir, isLoading } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const setWorktreeBaseDir =
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

	return (
		<div className="space-y-0.5">
			<Label className="text-sm font-medium">Worktree location</Label>
			<p className="text-xs text-muted-foreground">
				Base directory for new worktrees
			</p>
			<WorktreeLocationPicker
				currentPath={worktreeBaseDir}
				defaultPathLabel={`Default (${defaultWorktreePath})`}
				defaultBrowsePath={worktreeBaseDir}
				disabled={isLoading || setWorktreeBaseDir.isPending}
				onSelect={(path) => setWorktreeBaseDir.mutate({ path })}
				onReset={() => setWorktreeBaseDir.mutate({ path: null })}
			/>
		</div>
	);
}

function V2Body() {
	const { machineId } = useLocalHostService();
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const defaultWorktreePath = useDefaultWorktreePath();

	const hostOptions = useMemo<HostSelectOption[]>(() => {
		const opts: HostSelectOption[] = [];
		if (localHostId) {
			opts.push({
				id: localHostId,
				name: currentDeviceName ?? "This device",
				isLocal: true,
				isOnline: true,
			});
		}
		for (const host of otherHosts) {
			opts.push({
				id: host.id,
				name: host.name,
				isLocal: false,
				isOnline: host.isOnline,
			});
		}
		return opts;
	}, [currentDeviceName, localHostId, otherHosts]);

	const [selectedHostId, setSelectedHostId] = useState<string | null>(
		() => localHostId ?? machineId ?? null,
	);
	const effectiveHostId =
		selectedHostId && hostOptions.some((o) => o.id === selectedHostId)
			? selectedHostId
			: (hostOptions[0]?.id ?? null);

	const targetHostUrl = useHostUrl(effectiveHostId);
	const selectedHost =
		hostOptions.find((o) => o.id === effectiveHostId) ?? null;
	const isLocal = selectedHost?.isLocal ?? true;
	const isOnline = selectedHost?.isOnline ?? false;
	const hasMultipleHosts = hostOptions.length > 1;

	const settingsQuery = useV2WorktreeLocationSettings(targetHostUrl, {
		enabled: isOnline,
	});
	const setLocation = useSetV2WorktreeBaseDir(targetHostUrl);

	const disabled =
		!targetHostUrl ||
		!isOnline ||
		settingsQuery.isLoading ||
		setLocation.isPending;

	return (
		<div className="space-y-2">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-0.5">
					<Label className="text-sm font-medium">Worktree location</Label>
					<p className="text-xs text-muted-foreground">
						{hasMultipleHosts
							? `Base directory for new worktrees on ${
									selectedHost?.isLocal
										? "this device"
										: (selectedHost?.name ?? "this device")
								}`
							: "Base directory for new worktrees"}
					</p>
				</div>
				{hasMultipleHosts && effectiveHostId ? (
					<HostSelect
						value={effectiveHostId}
						options={hostOptions}
						onValueChange={setSelectedHostId}
					/>
				) : null}
			</div>
			<V2WorktreeLocationPicker
				currentPath={settingsQuery.data?.worktreeBaseDir ?? null}
				fallbackPath={
					settingsQuery.data?.defaultWorktreeBaseDir ?? defaultWorktreePath
				}
				hostUrl={targetHostUrl}
				hostName={
					selectedHost?.isLocal
						? "this device"
						: (selectedHost?.name ?? "this device")
				}
				isRemoteTarget={!isLocal}
				disabled={disabled}
				browseTitle="Select default worktree location"
				onSelect={(path) => setLocation.mutate(path)}
				onReset={() => setLocation.mutate(null)}
			/>
			{hasMultipleHosts && !isOnline ? (
				<p className="text-xs text-muted-foreground">
					{selectedHost?.name ?? "This device"} is offline.
				</p>
			) : null}
		</div>
	);
}
