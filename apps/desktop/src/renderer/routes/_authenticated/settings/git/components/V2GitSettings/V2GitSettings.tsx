import {
	type BranchPrefixMode,
	resolveBranchPrefix,
} from "@superset/shared/workspace-launch";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { BranchPrefixControl } from "../../../components/BranchPrefixControl";
import {
	HostSelect,
	type HostSelectOption,
} from "../../../components/HostSelect";
import { SettingsRow } from "../../../components/SettingsRow";
import {
	useSetV2WorktreeBaseDir,
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "../../../components/V2WorktreeLocationPicker";
import { useDefaultWorktreePath } from "../../../components/WorktreeLocationPicker";

interface V2GitSettingsProps {
	hostId: string | null;
}

/**
 * v2 Git settings — host-wide branch-prefix default for whichever device the
 * picker has selected. Per-host setting; the dropdown only appears when the
 * user has 2+ devices in this org.
 */
export function V2GitSettings({ hostId }: V2GitSettingsProps) {
	const navigate = useNavigate();
	const hostService = useLocalHostService();
	const { machineId } = hostService;
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const targetHostUrl = useHostUrl(hostId);
	const targetHostId = hostId ?? machineId;
	const queryClient = useQueryClient();

	const hostOptions = useMemo<HostSelectOption[]>(() => {
		const options: HostSelectOption[] = [];
		if (localHostId) {
			options.push({
				id: localHostId,
				name: currentDeviceName ?? "This device",
				isLocal: true,
				isOnline: true,
			});
		}
		for (const host of otherHosts) {
			options.push({
				id: host.id,
				name: host.name,
				isLocal: false,
				isOnline: host.isOnline,
			});
		}
		if (targetHostId && !options.some((o) => o.id === targetHostId)) {
			options.push({
				id: targetHostId,
				name: targetHostId === machineId ? "This device" : targetHostId,
				isLocal: targetHostId === machineId,
				isOnline: targetHostId === machineId,
			});
		}
		return options;
	}, [currentDeviceName, localHostId, machineId, otherHosts, targetHostId]);

	const selectedHost = useMemo(
		() => hostOptions.find((o) => o.id === targetHostId) ?? null,
		[hostOptions, targetHostId],
	);
	const hasMultipleHosts = hostOptions.length > 1;
	const isRemoteTarget = Boolean(selectedHost && !selectedHost.isLocal);
	const isHostOnline = selectedHost?.isOnline ?? true;
	const selectedHostName = selectedHost?.isLocal
		? "this device"
		: (selectedHost?.name ?? "this device");

	const worktreeQuery = useV2WorktreeLocationSettings(targetHostUrl, {
		enabled: isHostOnline,
	});
	const setWorktreeBaseDir = useSetV2WorktreeBaseDir(targetHostUrl);
	const defaultWorktreePath = useDefaultWorktreePath();

	const branchPrefixQuery = useQuery({
		queryKey: ["host-branch-prefix", targetHostUrl] as const,
		enabled: !!targetHostUrl && isHostOnline,
		queryFn: () => {
			if (!targetHostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				targetHostUrl,
			).settings.branchPrefix.get.query();
		},
	});

	const gitInfoQuery = useQuery({
		queryKey: ["host-git-info", targetHostUrl] as const,
		enabled: !!targetHostUrl && isHostOnline,
		staleTime: 5 * 60 * 1000,
		queryFn: () => {
			if (!targetHostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				targetHostUrl,
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
			if (!targetHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "update the branch prefix",
					}),
				);
			}
			return getHostServiceClientByUrl(
				targetHostUrl,
			).settings.branchPrefix.set.mutate(vars);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["host-branch-prefix", targetHostUrl],
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
		!targetHostUrl ||
		!isHostOnline ||
		branchPrefixQuery.isLoading ||
		setMutation.isPending;

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div className="min-w-0">
					<h2 className="text-xl font-semibold">Git &amp; worktrees</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Branch behavior for new workspaces on this device. Projects can
						override the prefix individually.
					</p>
				</div>
				{hasMultipleHosts && targetHostId ? (
					<HostSelect
						value={targetHostId}
						options={hostOptions}
						onValueChange={(nextHostId) => {
							void navigate({
								to: "/settings/git",
								search: { hostId: nextHostId },
								replace: true,
							});
						}}
					/>
				) : null}
			</header>

			<section>
				<SettingsRow
					label="Branch prefix"
					hint={
						<>
							Group new branches under a folder.{" "}
							<code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
								{previewPrefix ? `${previewPrefix}/branch-name` : "branch-name"}
							</code>
						</>
					}
				>
					<BranchPrefixControl
						mode={mode}
						customPrefix={customPrefix}
						disabled={controlsDisabled}
						onChange={(next) =>
							setMutation.mutate({
								mode: next.mode ?? "none",
								customPrefix: next.customPrefix,
							})
						}
					/>
				</SettingsRow>
				<SettingsRow
					label="Worktree location"
					hint={`Base directory for new worktrees on ${selectedHostName}.`}
				>
					<V2WorktreeLocationPicker
						currentPath={worktreeQuery.data?.worktreeBaseDir ?? null}
						fallbackPath={
							worktreeQuery.data?.defaultWorktreeBaseDir ?? defaultWorktreePath
						}
						hostUrl={targetHostUrl}
						hostName={selectedHostName}
						isRemoteTarget={isRemoteTarget}
						disabled={
							!targetHostUrl ||
							!isHostOnline ||
							worktreeQuery.isLoading ||
							setWorktreeBaseDir.isPending
						}
						browseTitle="Select default worktree location"
						onSelect={(path) => setWorktreeBaseDir.mutate(path)}
						onReset={() => setWorktreeBaseDir.mutate(null)}
					/>
				</SettingsRow>
			</section>
		</div>
	);
}
