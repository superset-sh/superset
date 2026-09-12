import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import {
	PROJECT_ICON_NONE,
	resolveProjectIconUrl,
} from "renderer/hooks/host-projects/resolveProjectIconUrl";
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
import { SettingsSection } from "../../../../components/SettingsSection";
import { BranchPrefixSection } from "./components/BranchPrefixSection";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { IconUploadField } from "./components/IconUploadField";
import { NameSection } from "./components/NameSection";
import { NamingInstructionsSection } from "./components/NamingInstructionsSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";
import { SparseCheckoutSection } from "./components/SparseCheckoutSection";
import { V2ScriptsEditor } from "./components/V2ScriptsEditor";
import { WorktreeLocationSection } from "./components/WorktreeLocationSection";

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

	// Icons are per-host. Prefer the targeted host's row — the one the picker
	// writes to — falling back to the merged fan-out value only while it loads
	// (same rule as Name). Custom icon wins; else the GitHub owner avatar.
	const projectIcon = hostProject ? hostProject.icon : project.icon;
	const iconUrl = resolveProjectIconUrl({
		icon: projectIcon,
		repoOwner: project.repoOwner,
	});
	// Accent color follows the same per-host precedence as the icon.
	const projectColor = hostProject ? hostProject.color : project.color;
	const canRename = Boolean(
		targetHostUrl && targetHostId && project.hostIds.includes(targetHostId),
	);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<ProjectThumbnail
						projectName={project.name}
						iconUrl={iconUrl}
						color={projectColor}
					/>
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
				<SettingsSection
					title={t({
						message: "General",
					})}
				>
					<SettingsRow label={t({ message: "Name" })} htmlFor="project-name">
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
					<SettingsRow
						label={t({
							message: "Repository",
						})}
						htmlFor="project-repo"
					>
						<RepositorySection repoUrl={project.repoUrl} />
					</SettingsRow>
					<SettingsRow
						label={t({ message: "Icon" })}
						hint={t({
							message:
								"Pick an icon and a color, or upload a custom image. Defaults to the linked GitHub owner's avatar.",
						})}
					>
						<IconUploadField
							projectId={projectId}
							projectName={project.name}
							hostUrl={targetHostUrl}
							iconUrl={iconUrl}
							hasCustomIcon={Boolean(
								projectIcon && projectIcon !== PROJECT_ICON_NONE,
							)}
							isIconRemoved={projectIcon === PROJECT_ICON_NONE}
							color={projectColor}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={t({
						message: "Branches & naming",
					})}
					description={t({
						message:
							"How branches and workspace names are created for this project.",
					})}
				>
					{targetHostUrl && hostProject && (
						<SettingsRow
							label={t({
								message: "Branch prefix",
							})}
							hint={t({
								message:
									"Namespace new branches for this project. Defaults to the host-wide Git setting.",
							})}
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
					{targetHostUrl && hostProject && (
						<NamingInstructionsSection
							// Remount per project AND per target host: the editor holds
							// draft text and pending-save state that must not carry
							// across either boundary (same rule as SparseCheckoutSection).
							key={`${projectId}:${targetHostId}`}
							projectId={projectId}
							hostUrl={targetHostUrl}
							// Hosts older than this setting omit the field entirely.
							instructions={hostProject.namingInstructions ?? null}
							onChanged={() => refetchHostProject()}
						/>
					)}
				</SettingsSection>

				<SettingsSection
					title={t({
						message: "Location & checkout",
					})}
					description={t({
						message:
							"Where the repository and new worktrees live on this host.",
					})}
				>
					<SettingsRow
						label={t({
							message: "Location",
						})}
					>
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
					</SettingsRow>
					<SettingsRow
						label={t({
							message: "Worktrees",
						})}
						hint={t({
							message:
								"Base directory for new worktree workspaces on this host.",
						})}
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
					{targetHostUrl && hostProject && (
						<div className="pt-4">
							<div className="mb-3">
								<Label
									htmlFor="project-sparse-checkout"
									className="text-sm font-medium"
								>
									<Trans>Sparse checkout</Trans>
								</Label>
								<p className="mt-0.5 text-xs text-muted-foreground">
									<Trans>
										Folders to check out into new worktrees, one per line,
										relative to the repo root. Files at the root are always
										included. Empty checks out everything.
									</Trans>
								</p>
							</div>
							<SparseCheckoutSection
								// Remount per project AND per target host: the editor
								// holds draft text and pending-save state, and switching
								// either while the field is focused must not carry the
								// draft or an in-flight save across the boundary — a
								// project can be viewed across multiple hosts.
								key={`${projectId}:${targetHostId}`}
								projectId={projectId}
								hostUrl={targetHostUrl}
								// Hosts older than this setting omit the field entirely.
								paths={hostProject.sparseCheckoutPaths ?? []}
								onChanged={() => refetchHostProject()}
							/>
						</div>
					)}
				</SettingsSection>

				{targetHostUrl && (
					<SettingsSection
						title={t({
							message: "Project lifecycle scripts",
						})}
						description={t({
							message:
								"Commands run for workspace setup, teardown, and the Run button.",
						})}
					>
						<V2ScriptsEditor hostUrl={targetHostUrl} projectId={projectId} />
					</SettingsSection>
				)}

				<SettingsSection
					title={t({
						message: "Danger zone",
					})}
				>
					<DeleteProjectSection
						projectId={projectId}
						projectName={project.name}
						hostIds={project.hostIds}
					/>
				</SettingsSection>
			</div>
		</div>
	);
}
