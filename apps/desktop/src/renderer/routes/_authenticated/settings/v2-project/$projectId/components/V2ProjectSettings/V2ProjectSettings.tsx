import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SettingsSection } from "../../../../project/$projectId/components/ProjectSettings";
import { ProjectSettingsHeader } from "../../../../project/$projectId/components/ProjectSettingsHeader";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { IconUploadField } from "./components/IconUploadField";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";

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

			<div className="space-y-8">
				<SettingsSection
					title="Repository"
					description="The GitHub repository this project tracks. Change it to re-link this project to a different repo."
				>
					<RepositorySection
						projectId={projectId}
						currentRepoCloneUrl={project.repoCloneUrl}
					/>
				</SettingsSection>

				<SettingsSection
					title="Host Service Location"
					description="Where this project lives on disk, per host connected to this organization."
				>
					<ProjectLocationSection
						projectId={projectId}
						currentPath={hostProject?.repoPath ?? null}
						repoCloneUrl={project.repoCloneUrl}
						onChanged={() => refetchHostProject()}
					/>
				</SettingsSection>

				<SettingsSection
					title="Appearance"
					description="A custom icon shown next to this project in the sidebar. PNG, JPEG, or WebP up to 4.5MB."
				>
					<IconUploadField
						projectId={projectId}
						iconUrl={project.iconUrl ?? null}
						hasGitHubRepo={project.repoCloneUrl != null}
					/>
				</SettingsSection>

				<SettingsSection title="Danger Zone">
					<DeleteProjectSection
						projectId={projectId}
						projectName={project.name}
					/>
				</SettingsSection>
			</div>
		</div>
	);
}
