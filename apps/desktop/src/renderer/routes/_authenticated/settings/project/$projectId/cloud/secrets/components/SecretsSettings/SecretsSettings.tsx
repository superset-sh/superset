import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiOutlineCloud } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { SettingsSection } from "../../../../components/ProjectSettings";
import { AddSecretSheet } from "./components/AddSecretSheet";
import { EditSecretDialog } from "./components/EditSecretDialog";
import { EnvironmentVariablesList } from "./components/EnvironmentVariablesList";

interface SecretsSettingsProps {
	projectId: string;
}

interface EditingSecret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
}

export function SecretsSettings({ projectId }: SecretsSettingsProps) {
	const utils = electronTrpc.useUtils();
	const collections = useCollections();
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});

	const linkToNeon = electronTrpc.projects.linkToNeon.useMutation({
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.projects.getRecents.invalidate();
		},
	});

	const { data: cloudProjects } = useLiveQuery(
		(q) =>
			q.from({ projects: collections.projects }).select(({ projects }) => ({
				id: projects.id,
				repoOwner: projects.repoOwner,
				repoName: projects.repoName,
			})),
		[collections.projects],
	);

	const suggestedMatch = useMemo(() => {
		if (!project || project.neonProjectId || !cloudProjects) return null;
		const repoName = project.mainRepoPath.split("/").pop();
		if (!repoName || !project.githubOwner) return null;
		return cloudProjects.find(
			(cloud) =>
				cloud.repoOwner === project.githubOwner && cloud.repoName === repoName,
		);
	}, [project, cloudProjects]);

	useEffect(() => {
		if (suggestedMatch) {
			linkToNeon.mutate({
				id: projectId,
				neonProjectId: suggestedMatch.id,
			});
		}
	}, [suggestedMatch, linkToNeon.mutate, projectId, linkToNeon]);

	const linkedCloudProject = useMemo(() => {
		if (!project?.neonProjectId || !cloudProjects) return null;
		return cloudProjects.find((c) => c.id === project.neonProjectId);
	}, [project?.neonProjectId, cloudProjects]);

	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const [isCreatingCloud, setIsCreatingCloud] = useState(false);
	const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
	const [editingSecret, setEditingSecret] = useState<EditingSecret | null>(
		null,
	);
	const [refreshKey, setRefreshKey] = useState(0);

	const handleCreateCloudProject = useCallback(async () => {
		if (!project || !organizationId || !project.githubOwner) return;
		const repoName = project.mainRepoPath.split("/").pop();
		if (!repoName) return;

		setIsCreatingCloud(true);
		try {
			const cloudProject = await apiTrpcClient.project.create.mutate({
				organizationId,
				name: project.name,
				slug: repoName.toLowerCase(),
				repoOwner: project.githubOwner,
				repoName,
				repoUrl: `https://github.com/${project.githubOwner}/${repoName}`,
			});
			linkToNeon.mutate({
				id: projectId,
				neonProjectId: cloudProject.id,
			});
		} catch (err) {
			console.error("[project-settings] Failed to create cloud project:", err);
		} finally {
			setIsCreatingCloud(false);
		}
	}, [project, organizationId, linkToNeon, projectId]);

	const handleSaved = () => {
		setRefreshKey((k) => k + 1);
	};

	if (!project) {
		return null;
	}

	const isConnected = !!project.neonProjectId && !!linkedCloudProject;

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Environment Variables</h2>
			</div>

			<div className="space-y-6">
				{isConnected && organizationId && project.neonProjectId ? (
					<EnvironmentVariablesList
						key={refreshKey}
						cloudProjectId={project.neonProjectId}
						organizationId={organizationId}
						onAdd={() => setIsAddSheetOpen(true)}
						onEdit={setEditingSecret}
					/>
				) : (
					<SettingsSection
						icon={<HiOutlineCloud className="h-4 w-4" />}
						title="Cloud Project"
						description="Link this project to a cloud project for sandboxes and environment variables."
					>
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
								{linkToNeon.isPending
									? "Connecting..."
									: "Not connected to a cloud project."}
							</p>
							{!linkToNeon.isPending && (
								<Button
									size="sm"
									variant="outline"
									disabled={isCreatingCloud || !project.githubOwner}
									onClick={handleCreateCloudProject}
								>
									{isCreatingCloud ? "Connecting..." : "Connect to Cloud"}
								</Button>
							)}
						</div>
					</SettingsSection>
				)}
			</div>

			{organizationId && (
				<AddSecretSheet
					open={isAddSheetOpen}
					onOpenChange={setIsAddSheetOpen}
					projectId={project.neonProjectId ?? ""}
					organizationId={organizationId}
					onSaved={handleSaved}
				/>
			)}

			{organizationId && editingSecret && (
				<EditSecretDialog
					open={!!editingSecret}
					onOpenChange={(open) => {
						if (!open) setEditingSecret(null);
					}}
					projectId={project.neonProjectId ?? ""}
					organizationId={organizationId}
					secret={editingSecret}
					onSaved={handleSaved}
				/>
			)}
		</div>
	);
}
