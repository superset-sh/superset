import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HiOutlineComputerDesktop, HiOutlineServer } from "react-icons/hi2";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { IconUploadField } from "./components/IconUploadField";
import { NameSection } from "./components/NameSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";
import { SettingsRow } from "./components/SettingsRow";
import { V2ScriptsEditor } from "./components/V2ScriptsEditor";

interface V2ProjectSettingsProps {
	projectId: string;
	hostId: string | null;
}

interface ProjectSettingsHostOption {
	id: string;
	name: string;
	isLocal: boolean;
	isOnline: boolean;
}

export function V2ProjectSettings({
	projectId,
	hostId,
}: V2ProjectSettingsProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { currentDeviceName, localHostId, otherHosts } =
		useWorkspaceHostOptions();
	const targetHostUrl = useHostUrl(hostId);
	const targetHostId = hostId ?? machineId;

	const { data: v2Project } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) => eq(projects.id, projectId))
				.select(({ projects }) => ({ ...projects })),
		[collections, projectId],
	);

	const hostOptions = useMemo<ProjectSettingsHostOption[]>(() => {
		const options: ProjectSettingsHostOption[] = [];
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

	const project = v2Project?.[0];
	if (!project) return null;

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<IconUploadField
						projectId={projectId}
						iconUrl={project.iconUrl ?? null}
						hasGitHubRepo={project.repoCloneUrl != null}
					/>
					<h2 className="truncate text-xl font-semibold">{project.name}</h2>
				</div>
				{hasMultipleHosts && targetHostId ? (
					<Select
						value={targetHostId}
						onValueChange={(nextHostId) => {
							void navigate({
								to: "/settings/projects/$projectId",
								params: { projectId },
								search: { hostId: nextHostId },
								replace: true,
							});
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-8 gap-1.5 px-2 text-foreground"
						>
							<SelectValue>
								<span className="flex items-center gap-1.5">
									<span className="truncate">
										{selectedHost?.isLocal
											? "This device"
											: (selectedHost?.name ?? targetHostId)}
									</span>
									{selectedHost && !selectedHost.isLocal && (
										<span
											title={selectedHost.isOnline ? "Online" : "Offline"}
											className={
												selectedHost.isOnline
													? "size-1.5 shrink-0 rounded-full bg-emerald-500"
													: "size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
											}
										/>
									)}
								</span>
							</SelectValue>
						</SelectTrigger>
						<SelectContent align="end">
							{hostOptions.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									<span className="flex items-center gap-2">
										{option.isLocal ? (
											<HiOutlineComputerDesktop className="size-4 text-muted-foreground" />
										) : (
											<HiOutlineServer className="size-4 text-muted-foreground" />
										)}
										<span className="truncate">
											{option.isLocal ? "This device" : option.name}
										</span>
										{!option.isLocal && !option.isOnline && (
											<span className="text-xs text-muted-foreground">
												offline
											</span>
										)}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</header>

			<div className="space-y-10">
				<section>
					<SettingsRow label="Name" htmlFor="project-name">
						<NameSection projectId={projectId} currentName={project.name} />
					</SettingsRow>
					<SettingsRow label="Repository" htmlFor="project-repo">
						<RepositorySection
							projectId={projectId}
							currentRepoCloneUrl={project.repoCloneUrl}
						/>
					</SettingsRow>
				</section>

				<section>
					<SettingsRow label="Location">
						<ProjectLocationSection
							projectId={projectId}
							currentPath={hostProject?.repoPath ?? null}
							repoCloneUrl={project.repoCloneUrl}
							hostId={targetHostId ?? null}
							hostUrl={targetHostUrl}
							hostName={targetHostName}
							isRemoteTarget={isRemoteTarget}
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
					/>
				</section>
			</div>
		</div>
	);
}
