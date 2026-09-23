import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { LuFolder } from "react-icons/lu";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjectGroups } from "renderer/hooks/host-projects/useHostProjectGroups";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";
import {
	buildProjectSettingsRows,
	type ProjectSettingsRow,
} from "./buildProjectSettingsRows";

type ProjectRow = Omit<ProjectSettingsRow, "kind"> & {
	kind: "v1" | "project" | "folder";
};

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
	selectedGroupId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
	selectedGroupId,
}: ProjectsSettingsSidebarProps) {
	const { t } = useLingui();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();
	const isMultiRepoEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MULTI_REPO_PROJECTS) ??
		import.meta.env.DEV;
	const { groups: projectGroups } = useHostProjectGroups({
		enabled: isMultiRepoEnabled,
	});
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				iconUrl: resolveProjectIconUrl(project),
				color: project.color,
			})),
		[hostProjects],
	);

	const listGroups = useMemo<Array<SettingsListGroup<ProjectRow>>>(() => {
		if (isV2CloudEnabled) {
			const v2Rows: ProjectRow[] = buildProjectSettingsRows(
				v2Projects,
				isMultiRepoEnabled ? projectGroups : [],
			);
			return [{ id: "v2", title: "v2", rows: v2Rows }];
		}

		const v1Rows: ProjectRow[] = groups.map((g) => ({
			kind: "v1",
			id: g.project.id,
			name: g.project.name,
			iconUrl: g.project.iconUrl,
			color: g.project.color === PROJECT_COLOR_DEFAULT ? null : g.project.color,
			groupId: null,
			parentGroupId: null,
			depth: 0,
		}));
		return [{ id: "v1", title: "v1", rows: v1Rows }];
	}, [groups, isMultiRepoEnabled, isV2CloudEnabled, projectGroups, v2Projects]);

	return (
		<SettingsListSidebar
			searchPlaceholder={t({
				message: "Filter projects...",
			})}
			searchAriaLabel={t({
				message: "Filter projects",
			})}
			hideFilterWhenEmpty
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) =>
				`${row.kind}:${row.groupId ?? row.parentGroupId ?? ""}:${row.id}`
			}
			emptyLabel={t({
				message: "No projects yet.",
			})}
			noMatchLabel={(q) =>
				t({
					message: `No projects match "${q}".`,
				})
			}
			renderRow={(row) =>
				row.groupId ? (
					<Link
						to="/settings/projects/group/$groupId"
						params={{ groupId: row.groupId }}
						className={settingsListItemClass(
							row.groupId === selectedGroupId,
							"gap-2",
						)}
					>
						<ProjectThumbnail
							projectName={row.name}
							iconUrl={row.iconUrl}
							color={row.color}
							className="size-5"
						/>
						<span className="truncate">{row.name}</span>
					</Link>
				) : (
					<Link
						to="/settings/projects/$projectId"
						params={{ projectId: row.id }}
						className={settingsListItemClass(
							!selectedGroupId && row.id === selectedProjectId,
							cn("gap-2", row.depth === 1 && "pl-7"),
						)}
					>
						{row.depth === 1 ? (
							<LuFolder className="size-4 shrink-0 text-muted-foreground" />
						) : (
							<ProjectThumbnail
								projectName={row.name}
								iconUrl={row.iconUrl}
								color={row.color}
								className="size-5"
							/>
						)}
						<span className="truncate">{row.name}</span>
					</Link>
				)
			}
		/>
	);
}
