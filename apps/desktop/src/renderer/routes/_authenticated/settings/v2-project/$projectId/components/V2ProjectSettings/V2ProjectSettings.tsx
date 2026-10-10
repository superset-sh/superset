import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { HostSelectOption } from "../../../../components/HostSelect";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { V2ProjectSettingsBody } from "./components/V2ProjectSettingsBody";
import { V2ScriptsEditor } from "./components/V2ScriptsEditor";

interface V2ProjectSettingsProps {
	projectId: string;
	hostId: string | null;
	/** One-shot deep-link: scroll to and focus this field after load. */
	focusField?: string | null;
}

export function V2ProjectSettings({
	projectId,
	hostId,
	focusField,
}: V2ProjectSettingsProps) {
	const navigate = useNavigate();
	const { t } = useLingui();
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
				name: currentDeviceName ?? t({ message: "This device" }),
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
				name:
					targetHostId === machineId
						? t({
								message: "This device",
							})
						: targetHostId,
				isLocal: targetHostId === machineId,
				isOnline: targetHostId === machineId,
			});
		}
		return options;
	}, [currentDeviceName, localHostId, machineId, otherHosts, t, targetHostId]);

	const selectedHost = useMemo(
		() => hostOptions.find((option) => option.id === targetHostId) ?? null,
		[hostOptions, targetHostId],
	);
	const targetHostName = useMemo(() => {
		if (selectedHost?.name) return selectedHost.name;
		if (!targetHostId || targetHostId === machineId)
			return t({
				message: "this device",
			});
		return targetHostId;
	}, [machineId, selectedHost, t, targetHostId]);
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

	// Deep-link focus (e.g. "Update naming instructions" from the create-
	// workspace flow). Wait for the host row: the target fields only render
	// once it has loaded. One-shot per project, not per mount — the route
	// component instance is reused across projectId changes.
	const focusAppliedForRef = useRef<string | null>(null);
	useEffect(() => {
		if (!focusField || !hostProject || focusAppliedForRef.current === projectId)
			return;
		const el = document.getElementById(`project-${focusField}`);
		if (!el) return;
		focusAppliedForRef.current = projectId;
		el.scrollIntoView({ block: "center" });
		el.focus({ preventScroll: true });
	}, [focusField, hostProject, projectId]);

	if (!project) {
		if (!isReady) return null;
		return (
			<div className="p-6 text-sm text-muted-foreground select-text cursor-text">
				<Trans>Project not found.</Trans>
			</div>
		);
	}

	return (
		<V2ProjectSettingsBody
			projectId={projectId}
			project={project}
			hostProject={hostProject}
			targetHostUrl={targetHostUrl}
			targetHostId={targetHostId}
			targetHostName={targetHostName}
			isRemoteTarget={isRemoteTarget}
			isHostOnline={selectedHost?.isOnline ?? false}
			hostOptions={hostOptions}
			onHostChange={(nextHostId) => {
				void navigate({
					to: "/settings/projects/$projectId",
					params: { projectId },
					search: { hostId: nextHostId },
					replace: true,
				});
			}}
			onHostProjectChanged={refetchHostProject}
			locationSection={
				<ProjectLocationSection
					projectId={projectId}
					projectName={project.name}
					currentPath={hostProject?.repoPath ?? null}
					repoCloneUrl={project.repoUrl}
					hostUrl={targetHostUrl}
					hostName={targetHostName}
					isRemoteTarget={isRemoteTarget}
					onChanged={() => refetchHostProject()}
				/>
			}
			scriptsEditor={
				targetHostUrl ? (
					<V2ScriptsEditor hostUrl={targetHostUrl} projectId={projectId} />
				) : null
			}
			dangerZone={
				<DeleteProjectSection
					projectId={projectId}
					projectName={project.name}
					hostIds={project.hostIds}
				/>
			}
		/>
	);
}
