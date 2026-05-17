import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SettingsSection } from "../../../../project/$projectId/components/ProjectSettings";
import { ProjectSettingsHeader } from "../../../../project/$projectId/components/ProjectSettingsHeader";
import { DeleteProjectSection } from "./components/DeleteProjectSection";
import { IconUploadField } from "./components/IconUploadField";
import { NameSection } from "./components/NameSection";
import { ProjectLocationSection } from "./components/ProjectLocationSection";
import { RepositorySection } from "./components/RepositorySection";
import { V2ScriptsEditor } from "./components/V2ScriptsEditor";

interface V2ProjectSettingsProps {
	projectId: string;
	hostId: string | null;
}

export function V2ProjectSettings({
	projectId,
	hostId,
}: V2ProjectSettingsProps) {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const targetHostUrl = useHostUrl(hostId);
	const targetHostId = hostId ?? machineId;

	const { data: v2Project } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) => eq(projects.id, projectId))
				.select(({ projects }) => ({ ...projects })),
		[collections, projectId],
	);

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) => eq(hosts.machineId, targetHostId ?? ""))
				.select(({ hosts }) => ({
					machineId: hosts.machineId,
					name: hosts.name,
				})),
		[collections, targetHostId],
	);
	const targetHostName = useMemo(() => {
		if (hostRows[0]?.name) return hostRows[0].name;
		if (!targetHostId || targetHostId === machineId) return "this device";
		return targetHostId;
	}, [hostRows, machineId, targetHostId]);
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

	const project = v2Project?.[0];
	if (!project) return null;

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<ProjectSettingsHeader title={project.name} />

			<div className="space-y-6">
				<SettingsSection title="Name">
					<NameSection projectId={projectId} currentName={project.name} />
				</SettingsSection>

				<SettingsSection title="Repository">
					<RepositorySection
						projectId={projectId}
						currentRepoCloneUrl={project.repoCloneUrl}
					/>
				</SettingsSection>

				<SettingsSection
					title="Project location"
					description={`Where this project lives on disk on ${targetHostName}.`}
				>
					<ProjectLocationSection
						projectId={projectId}
						currentPath={hostProject?.repoPath ?? null}
						repoCloneUrl={project.repoCloneUrl}
						hostUrl={targetHostUrl}
						hostName={targetHostName}
						isRemoteTarget={isRemoteTarget}
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

				{targetHostUrl && (
					<SettingsSection
						title="Scripts"
						description="Runs in a terminal for setup, teardown, and the workspace Run button. Saved to .superset/config.json in the main repo."
					>
						<V2ScriptsEditor hostUrl={targetHostUrl} projectId={projectId} />
					</SettingsSection>
				)}

				<div className="pt-2 border-t border-border">
					<DeleteProjectSection
						projectId={projectId}
						projectName={project.name}
					/>
				</div>
			</div>
		</div>
	);
}
