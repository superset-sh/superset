import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/SettingsListSidebar";

interface ProjectRow {
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
	const collections = useCollections();
	const { data: session } = authClient.useSession();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: v2Projects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({
					id: projects.id,
					name: projects.name,
					iconUrl: projects.iconUrl,
				})),
		[collections, activeOrganizationId],
	);

	const listGroups = useMemo<Array<SettingsListGroup<ProjectRow>>>(() => {
		const v2Rows: ProjectRow[] = v2Projects.map((p) => ({
			id: p.id,
			name: p.name,
			iconUrl: p.iconUrl ?? null,
		}));

		return [{ id: "projects", title: "Projects", rows: v2Rows }];
	}, [v2Projects]);

	return (
		<SettingsListSidebar
			searchPlaceholder="Filter projects..."
			searchAriaLabel="Filter projects"
			hideFilterWhenEmpty
			groups={listGroups}
			filterRow={(row, q) => row.name.toLowerCase().includes(q.toLowerCase())}
			getRowKey={(row) => row.id}
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
