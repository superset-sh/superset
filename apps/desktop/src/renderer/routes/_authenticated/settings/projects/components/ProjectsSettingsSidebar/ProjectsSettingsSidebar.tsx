import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type SettingsListGroup,
	settingsListItemClass,
	SettingsListSidebar,
} from "../../../components/SettingsListSidebar";

interface ProjectRow {
	id: string;
	name: string;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const collections = useCollections();
	const { data: session } = authClient.useSession();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: v1Groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery(undefined, {
			enabled: !isV2CloudEnabled,
		});

	const { data: v2Projects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({ ...projects })),
		[collections, activeOrganizationId],
	);

	const listGroups = useMemo<Array<SettingsListGroup<ProjectRow>>>(() => {
		const rows: ProjectRow[] = isV2CloudEnabled
			? v2Projects.map((p) => ({ id: p.id, name: p.name }))
			: v1Groups.map((g) => ({ id: g.project.id, name: g.project.name }));
		return [{ id: "projects", title: "Projects", rows }];
	}, [isV2CloudEnabled, v1Groups, v2Projects]);

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
					className={settingsListItemClass(row.id === selectedProjectId)}
				>
					<span className="truncate">{row.name}</span>
				</Link>
			)}
		/>
	);
}
