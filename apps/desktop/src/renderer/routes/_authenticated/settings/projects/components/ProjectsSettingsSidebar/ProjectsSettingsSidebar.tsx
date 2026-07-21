import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface ProjectRow {
	kind: "v1" | "v2";
	id: string;
	name: string;
	iconUrl: string | null;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				iconUrl: project.repoOwner
					? `https://github.com/${project.repoOwner}.png?size=64`
					: null,
			})),
		[hostProjects],
	);

	const listGroups = useMemo<Array<SettingsListGroup<ProjectRow>>>(() => {
		if (isV2CloudEnabled) {
			const v2Rows: ProjectRow[] = v2Projects.map((p) => ({
				kind: "v2",
				id: p.id,
				name: p.name,
				iconUrl: p.iconUrl ?? null,
			}));
			return [{ id: "v2", title: "v2", rows: v2Rows }];
		}

		const v1Rows: ProjectRow[] = groups.map((g) => ({
			kind: "v1",
			id: g.project.id,
			name: g.project.name,
			iconUrl: g.project.iconUrl,
		}));
		return [{ id: "v1", title: "v1", rows: v1Rows }];
	}, [groups, v2Projects, isV2CloudEnabled]);

	return (
		<SettingsListSidebar
			searchPlaceholder="Filter projects..."
			searchAriaLabel="Filter projects"
			hideFilterWhenEmpty
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) => `${row.kind}:${row.id}`}
			emptyLabel="No projects yet."
			noMatchLabel={(q) => `No projects match "${q}".`}
			renderRow={(row) => (
				<Link
					to="/settings/projects/$projectId"
					params={{ projectId: row.id }}
					className={settingsListItemClass(
						row.id === selectedProjectId,
						"gap-2",
					)}
				>
					<ProjectThumbnail
						projectName={row.name}
						iconUrl={row.iconUrl}
						className="size-5"
					/>
					<span className="truncate">{row.name}</span>
				</Link>
			)}
		/>
	);
}
