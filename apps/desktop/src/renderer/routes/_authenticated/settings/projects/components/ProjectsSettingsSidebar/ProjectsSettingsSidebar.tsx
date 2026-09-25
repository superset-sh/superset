import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface ProjectRow {
	id: string;
	name: string;
	iconUrl: string | null;
	color: string | null;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
	const { t } = useLingui();

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();

	const listGroups = useMemo<Array<SettingsListGroup<ProjectRow>>>(() => {
		const rows: ProjectRow[] = hostProjects.map((project) => ({
			id: project.projectKey,
			name: project.name,
			iconUrl: resolveProjectIconUrl(project) ?? null,
			color: project.color,
		}));
		return [{ id: "projects", title: "projects", rows }];
	}, [hostProjects]);

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
			getRowKey={(row) => row.id}
			emptyLabel={t({
				message: "No projects yet.",
			})}
			noMatchLabel={(q) =>
				t({
					message: `No projects match "${q}".`,
				})
			}
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
						color={row.color}
						className="size-5"
					/>
					<span className="truncate">{row.name}</span>
				</Link>
			)}
		/>
	);
}
