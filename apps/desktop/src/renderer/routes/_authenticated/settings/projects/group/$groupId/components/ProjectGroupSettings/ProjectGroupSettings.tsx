import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuChevronRight, LuFolder } from "react-icons/lu";
import {
	PROJECT_ICON_NONE,
	resolveProjectIconUrl,
} from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjectGroups } from "renderer/hooks/host-projects/useHostProjectGroups";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SettingsRow } from "renderer/routes/_authenticated/settings/components/SettingsRow";
import { SettingsSection } from "renderer/routes/_authenticated/settings/components/SettingsSection";
import { BranchPrefixSection } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/BranchPrefixSection";
import { IconUploadField } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/IconUploadField";
import { NameSection } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/NameSection";
import { NamingInstructionsSection } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/NamingInstructionsSection";
import { SourceFoldersSection } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/SourceFoldersSection";
import { WorktreeLocationSection } from "renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/WorktreeLocationSection";
import { DeleteProjectGroupSection } from "./components/DeleteProjectGroupSection";

interface ProjectGroupSettingsProps {
	groupId: string;
}

export function ProjectGroupSettings({ groupId }: ProjectGroupSettingsProps) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { groups, isReady: areGroupsReady } = useHostProjectGroups({
		enabled: true,
	});
	const group = useMemo(
		() => groups.find((candidate) => candidate.id === groupId) ?? null,
		[groupId, groups],
	);
	const hostUrl = useHostUrl(group?.hostId ?? null);
	const hostName =
		group?.hostId === machineId
			? t({ message: "this device" })
			: (group?.hostId ?? "");
	const isRemoteTarget = Boolean(
		group?.hostId && machineId && group.hostId !== machineId,
	);

	const { projects: hostProjects } = useHostProjects();
	const primaryProjectId = group?.members[0]?.projectId ?? null;
	const primaryProject = useMemo(
		() =>
			hostProjects.find((project) => project.projectKey === primaryProjectId) ??
			null,
		[hostProjects, primaryProjectId],
	);
	const projectsById = useMemo(
		() => new Map(hostProjects.map((project) => [project.projectKey, project])),
		[hostProjects],
	);

	const { data: hostProject, refetch: refetchHostProject } = useQuery({
		queryKey: ["host-project", "get", hostUrl, primaryProjectId],
		enabled: Boolean(hostUrl && primaryProjectId),
		queryFn: async () => {
			if (!hostUrl || !primaryProjectId) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.project.get.query({ projectId: primaryProjectId });
		},
	});

	if (!group || !primaryProjectId) {
		if (!areGroupsReady) return null;
		return (
			<div className="p-6 text-sm text-muted-foreground select-text cursor-text">
				<Trans>Project not found.</Trans>
			</div>
		);
	}

	const projectIcon = group.icon ?? hostProject?.icon ?? null;
	// A project assembled out of local folders has no remote of its own, so the
	// avatar comes from whichever source folder has one.
	const repoOwner =
		primaryProject?.repoOwner ??
		group.members
			.map((member) => projectsById.get(member.projectId)?.repoOwner)
			.find(Boolean) ??
		null;
	const iconUrl = resolveProjectIconUrl({ icon: projectIcon, repoOwner });

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<header className="mb-8 flex min-w-0 items-center gap-3">
				<ProjectThumbnail
					projectName={group.name}
					iconUrl={iconUrl}
					color={group.color ?? primaryProject?.color ?? null}
				/>
				<h2 className="truncate text-xl font-semibold">{group.name}</h2>
			</header>

			<div className="space-y-10">
				<SettingsSection
					title={t({
						message: "General",
					})}
				>
					<SettingsRow label={t({ message: "Name" })} htmlFor="project-name">
						<NameSection
							projectId={primaryProjectId}
							groupId={group.id}
							currentName={group.name}
							hostUrl={hostUrl}
							canRename={Boolean(hostUrl)}
						/>
					</SettingsRow>
					<SettingsRow
						label={t({ message: "Icon" })}
						hint={t({
							message:
								"Pick an icon and a color, or upload a custom image. Defaults to the linked GitHub owner's avatar.",
						})}
					>
						<IconUploadField
							projectId={primaryProjectId}
							projectName={group.name}
							hostUrl={hostUrl}
							iconUrl={iconUrl}
							hasCustomIcon={Boolean(
								projectIcon && projectIcon !== PROJECT_ICON_NONE,
							)}
							isIconRemoved={projectIcon === PROJECT_ICON_NONE}
							color={group.color ?? primaryProject?.color ?? null}
						/>
					</SettingsRow>
				</SettingsSection>

				<SourceFoldersSection
					projectId={primaryProjectId}
					groupId={group.id}
					hostUrl={hostUrl}
					hostName={hostName}
					isRemoteTarget={isRemoteTarget}
					isProjectSetup={Boolean(hostProject)}
				/>

				<SettingsSection
					title={t({
						message: "Branches & naming",
					})}
					description={t({
						message:
							"How branches and workspace names are created for this project.",
					})}
				>
					{hostUrl && hostProject && (
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
								projectId={primaryProjectId}
								hostUrl={hostUrl}
								mode={hostProject.branchPrefixMode ?? null}
								customPrefix={hostProject.branchPrefixCustom ?? null}
								onChanged={() => refetchHostProject()}
							/>
						</SettingsRow>
					)}
					{hostUrl && hostProject && (
						<NamingInstructionsSection
							key={`${primaryProjectId}:${group.hostId}`}
							projectId={primaryProjectId}
							hostUrl={hostUrl}
							instructions={hostProject.namingInstructions ?? null}
							onChanged={() => refetchHostProject()}
						/>
					)}
				</SettingsSection>

				<SettingsSection
					title={t({
						message: "Workspaces",
					})}
					description={t({
						message:
							"Where the container holding this project's checkouts is created.",
					})}
				>
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
							projectId={primaryProjectId}
							currentPath={hostProject?.worktreeBaseDir ?? null}
							hostUrl={hostUrl}
							hostName={hostName}
							isRemoteTarget={isRemoteTarget}
							isHostOnline={Boolean(hostUrl)}
							isProjectSetup={Boolean(hostProject)}
							onChanged={() => refetchHostProject()}
						/>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title={t({
						message: "Lifecycle scripts",
					})}
					description={t({
						message:
							"Each folder runs its own setup, teardown and run commands, in this order.",
					})}
				>
					<div className="divide-y divide-border/60 rounded-md border">
						{group.members.map((member) => (
							<Link
								key={member.id}
								to="/settings/projects/$projectId"
								params={{ projectId: member.projectId }}
								className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-fill-hover"
							>
								<LuFolder className="size-4 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate">{member.folder}</span>
								<span className="truncate text-xs text-muted-foreground">
									{projectsById.get(member.projectId)?.repoPath ?? ""}
								</span>
								<LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
							</Link>
						))}
					</div>
				</SettingsSection>

				<SettingsSection
					title={t({
						message: "Danger zone",
					})}
				>
					<DeleteProjectGroupSection
						groupId={group.id}
						groupName={group.name}
						hostUrl={hostUrl}
					/>
				</SettingsSection>
			</div>
		</div>
	);
}
