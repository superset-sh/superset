import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	HostSelect,
	type HostSelectOption,
} from "../../../../components/HostSelect";
import { SettingsRow } from "../../../../components/SettingsRow";
import { BranchPrefixSection } from "./components/BranchPrefixSection";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { IconUploadField } from "./components/IconUploadField";
import { NameSection } from "./components/NameSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";
import { V2ScriptsEditor } from "./components/V2ScriptsEditor";
import { WorktreeLocationSection } from "./components/WorktreeLocationSection";

interface V2ProjectSettingsProps {
	projectId: string;
	hostId: string | null;
}

export function V2ProjectSettings({
	projectId,
	hostId,
}: V2ProjectSettingsProps) {
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const targetHostUrl = useHostUrl(hostId);
	const targetHostId = hostId ?? machineId;

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useHostProjects();
	const project = useMemo(
		() => hostProjects.find((item) => item.projectKey === projectId) ?? null,
		[hostProjects, projectId],
	);

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
		if (targetHostId && !options.some((option) => option.id === targetHostId)) {
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
		() => hostOptions.find((option) => option.id === targetHostId) ?? null,
		[hostOptions, targetHostId],
	);
	const targetHostName = useMemo(() => {
		if (selectedHost?.name) return selectedHost.name;
		if (!targetHostId || targetHostId === machineId) return "this device";
		return targetHostId;
	}, [machineId, selectedHost, targetHostId]);
	const hasMultipleHosts = hostOptions.length > 1;
	const isRemoteTarget = Boolean(
		targetHostId && machineId && targetHostId !== machineId,
	);

	const { data: hostProject, refetch: refetchHostProject } = useQuery({
		queryKey: ["host-project", "get", targetHostUrl, projectId],
		enabled: !!targetHostUrl,
		queryFn: async () => {
			if (!targetHostUrl) return null;
			const client = getHostServiceClientByUrl(targetHostUrl);
			return client.project.get.query({ projectId });
		},
	});
	// External renames land on the merged fan-out item via project:changed;
	// re-pull the targeted host's row so host-sourced fields (Name) follow.
	const mergedUpdatedAt = project?.updatedAt;
	useEffect(() => {
		if (mergedUpdatedAt === undefined) return;
		void refetchHostProject();
	}, [mergedUpdatedAt, refetchHostProject]);

	if (!project) {
		if (!isReady) return null;
		return (
			<div className="p-6 text-sm text-muted-foreground select-text cursor-text">
				Project not found.
			</div>
		);
	}

	const iconUrl = project.repoOwner
		? `https://github.com/${project.repoOwner}.png?size=64`
		: null;
	const canRename = Boolean(
		targetHostUrl && targetHostId && project.hostIds.includes(targetHostId),
	);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<ProjectThumbnail projectName={project.name} iconUrl={iconUrl} />
					<h2 className="truncate text-xl font-semibold">{project.name}</h2>
				</div>
				{hasMultipleHosts && targetHostId ? (
					<HostSelect
						value={targetHostId}
						options={hostOptions}
						onValueChange={(nextHostId) => {
							void navigate({
								to: "/settings/projects/$projectId",
								params: { projectId },
								search: { hostId: nextHostId },
								replace: true,
							});
						}}
					/>
				) : null}
			</header>

			<div className="space-y-10">
				<section>
					<SettingsRow label="Name" htmlFor="project-name">
						<NameSection
							projectId={projectId}
							// The targeted host's own name, not the cross-host merged
							// one — the rename commits to that host, so a newer name
							// from another replica must not seed (and overwrite) it.
							currentName={hostProject?.name ?? project.name}
							hostUrl={targetHostUrl}
							canRename={canRename}
							onRenamed={() => refetchHostProject()}
						/>
					</SettingsRow>
					<SettingsRow label="Repository" htmlFor="project-repo">
						<RepositorySection repoUrl={project.repoUrl} />
					</SettingsRow>
					<SettingsRow
						label="Icon"
						hint="Upload a custom image, or use the linked GitHub owner's avatar."
					>
						<IconUploadField
							projectId={projectId}
							iconUrl={iconUrl}
							hasGitHubRepo={Boolean(project.repoOwner)}
						/>
					</SettingsRow>
					{targetHostUrl && hostProject && (
						<SettingsRow
							label="Branch prefix"
							hint="Namespace new branches for this project. Defaults to the host-wide Git setting."
						>
							<BranchPrefixSection
								projectId={projectId}
								hostUrl={targetHostUrl}
								mode={hostProject.branchPrefixMode ?? null}
								customPrefix={hostProject.branchPrefixCustom ?? null}
								onChanged={() => refetchHostProject()}
							/>
						</SettingsRow>
					)}
				</section>

				<section>
					<SettingsRow label="Location">
						<ProjectLocationSection
							projectId={projectId}
							projectName={project.name}
							currentPath={hostProject?.repoPath ?? null}
							repoCloneUrl={project.repoUrl}
							hostId={targetHostId ?? null}
							hostUrl={targetHostUrl}
							hostName={targetHostName}
							isRemoteTarget={isRemoteTarget}
							onChanged={() => refetchHostProject()}
						/>
					</SettingsRow>
					<SettingsRow
						label="Worktrees"
						hint="Base directory for new worktree workspaces on this host."
					>
						<WorktreeLocationSection
							projectId={projectId}
							currentPath={hostProject?.worktreeBaseDir ?? null}
							hostUrl={targetHostUrl}
							hostName={targetHostName}
							isRemoteTarget={isRemoteTarget}
							isHostOnline={selectedHost?.isOnline ?? false}
							isProjectSetup={Boolean(hostProject)}
							onChanged={() => refetchHostProject()}
						/>
					</SettingsRow>
					{targetHostUrl && (
						<div className="pt-4">
							<div className="mb-3">
								<h3 className="text-sm font-medium">Scripts</h3>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Runs in a terminal for setup, teardown, and the workspace Run
									button.
								</p>
							</div>
							<V2ScriptsEditor hostUrl={targetHostUrl} projectId={projectId} />
						</div>
					)}
				</section>

				<section>
					<DeleteProjectSection
						projectId={projectId}
						projectName={project.name}
						hostIds={project.hostIds}
					/>
				</section>
			</div>
		</div>
	);
}
