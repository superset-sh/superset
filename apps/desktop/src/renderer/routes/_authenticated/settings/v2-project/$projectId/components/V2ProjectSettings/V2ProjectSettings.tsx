import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ProjectSettingsHeader } from "../../../../project/$projectId/components/ProjectSettingsHeader";
import { ProjectLocationSection } from "./components/ProjectLocationSection";

interface V2ProjectSettingsProps {
	projectId: string;
}

export function V2ProjectSettings({ projectId }: V2ProjectSettingsProps) {
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();

	const { data: v2Project } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) => eq(projects.id, projectId))
				.select(({ projects }) => ({ ...projects })),
		[collections, projectId],
	);

	const { data: hostProject, refetch: refetchHostProject } = useQuery({
		queryKey: ["host-project", "get", activeHostUrl, projectId],
		enabled: !!activeHostUrl,
		queryFn: async () => {
			if (!activeHostUrl) return null;
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.project.get.query({ projectId });
		},
	});

	const project = v2Project?.[0];
	if (!project) return null;

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<ProjectSettingsHeader title={project.name} />

			<div className="space-y-4">
				<ProjectLocationSection
					projectId={projectId}
					currentPath={hostProject?.repoPath ?? null}
					onChanged={() => refetchHostProject()}
				/>
			</div>
		</div>
	);
}
