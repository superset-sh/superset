import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";
import {
	PROJECT_ICON_NONE,
	resolveProjectIconUrl,
} from "renderer/hooks/host-projects/resolveProjectIconUrl";
import type { HostProjectItem } from "renderer/hooks/host-projects/useHostProjects";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import {
	HostSelect,
	type HostSelectOption,
} from "../../../../../../components/HostSelect";
import { SettingsRow } from "../../../../../../components/SettingsRow";
import { SettingsSection } from "../../../../../../components/SettingsSection";
import { BranchPrefixSection } from "../BranchPrefixSection";
import { IconUploadField } from "../IconUploadField";
import { NameSection } from "../NameSection";
import { NamingInstructionsSection } from "../NamingInstructionsSection";
import { RepositorySection } from "../RepositorySection";
import { SparseCheckoutSection } from "../SparseCheckoutSection";
import { WorktreeLocationSection } from "../WorktreeLocationSection";

type HostProjectRow = Awaited<
	ReturnType<HostServiceClient["project"]["get"]["query"]>
>;

interface V2ProjectSettingsBodyProps {
	projectId: string;
	project: HostProjectItem;
	hostProject: HostProjectRow | null | undefined;
	targetHostUrl: string | null;
	targetHostId: string | null;
	targetHostName: string;
	isRemoteTarget: boolean;
	isHostOnline: boolean;
	hostOptions: HostSelectOption[];
	onHostChange: (hostId: string) => void;
	onHostProjectChanged: () => unknown;
	locationSection: ReactNode;
	scriptsEditor: ReactNode;
	dangerZone: ReactNode;
}

export function V2ProjectSettingsBody({
	projectId,
	project,
	hostProject,
	targetHostUrl,
	targetHostId,
	targetHostName,
	isRemoteTarget,
	isHostOnline,
	hostOptions,
	onHostChange,
	onHostProjectChanged,
	locationSection,
	scriptsEditor,
	dangerZone,
}: V2ProjectSettingsBodyProps) {
	const { t } = useLingui();
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
				{hostOptions.length > 1 && targetHostId ? (
					<HostSelect
						value={targetHostId}
						options={hostOptions}
						onValueChange={onHostChange}
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
							onRenamed={() => onHostProjectChanged()}
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
								onChanged={() => onHostProjectChanged()}
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
							onChanged={() => onHostProjectChanged()}
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
						{locationSection}
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
							isHostOnline={isHostOnline}
							isProjectSetup={Boolean(hostProject)}
							onChanged={() => onHostProjectChanged()}
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
								onChanged={() => onHostProjectChanged()}
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
						{scriptsEditor}
					</SettingsSection>
				)}

				<SettingsSection
					title={t({
						message: "Danger zone",
					})}
				>
					{dangerZone}
				</SettingsSection>
			</div>
		</div>
	);
}
