import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { HOST_PROJECT_GROUPS_QUERY_PREFIX } from "renderer/hooks/host-projects/useHostProjectGroups";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SettingsSection } from "../../../../../../components/SettingsSection";
import { RemoveFolderDialog } from "./components/RemoveFolderDialog";
import { RenameFolderDialog } from "./components/RenameFolderDialog";
import { SourceFolderRow } from "./components/SourceFolderRow";
import {
	toSourceFolders,
	withoutFolder,
	withPrimaryFolder,
} from "./SourceFoldersSection.utils";
import type { ProjectFolder } from "./types";

interface SourceFoldersSectionProps {
	projectId: string;
	groupId: string | null;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	/** The host has a row for this project; `project.folders.*` 404s otherwise. */
	isProjectSetup: boolean;
}

export function SourceFoldersSection({
	projectId,
	groupId,
	hostUrl,
	hostName,
	isRemoteTarget,
	isProjectSetup,
}: SourceFoldersSectionProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const [renameTarget, setRenameTarget] = useState<ProjectFolder | null>(null);
	const [removeTarget, setRemoveTarget] = useState<ProjectFolder | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);

	const queryKey = groupId
		? ["project-group-folders", "list", hostUrl, groupId]
		: ["project-folders", "list", hostUrl, projectId];
	const foldersQuery = useQuery({
		queryKey,
		enabled: Boolean(hostUrl) && isProjectSetup,
		queryFn: async () => {
			if (!hostUrl) return { folders: [] as ProjectFolder[] };
			const host = getHostServiceClientByUrl(hostUrl);
			if (!groupId) {
				return host.project.folders.list.query({ projectId });
			}
			const [{ group }, repositories] = await Promise.all([
				host.projectGroups.get.query({ groupId }),
				host.project.list.query(),
			]);
			return { folders: toSourceFolders(group.members, repositories) };
		},
	});
	const folders = foldersQuery.data?.folders ?? [];

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey });
		if (groupId) {
			void queryClient.invalidateQueries({
				queryKey: HOST_PROJECT_GROUPS_QUERY_PREFIX,
			});
		}
	};

	const runOptimistically = async (
		next: ProjectFolder[],
		request: () => Promise<unknown>,
	) => {
		await queryClient.cancelQueries({ queryKey });
		const previous = queryClient.getQueryData(queryKey);
		queryClient.setQueryData(queryKey, { folders: next });
		try {
			await request();
		} catch (error) {
			queryClient.setQueryData(queryKey, previous);
			throw error;
		} finally {
			invalidate();
		}
	};

	const client = () => {
		if (!hostUrl) throw new Error("Host unavailable");
		return getHostServiceClientByUrl(hostUrl);
	};

	const setPrimary = useMutation({
		mutationFn: (folder: ProjectFolder) =>
			runOptimistically(withPrimaryFolder(folders, folder.id), () =>
				groupId
					? client().projectGroups.setPrimary.mutate({
							groupId,
							memberId: folder.id,
						})
					: client().project.folders.setPrimary.mutate({
							projectId,
							folderId: folder.id,
						}),
			),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const remove = useMutation({
		mutationFn: (folder: ProjectFolder) =>
			runOptimistically(withoutFolder(folders, folder.id), () =>
				groupId
					? client().projectGroups.removeMember.mutate({
							groupId,
							memberId: folder.id,
						})
					: client().project.folders.remove.mutate({
							projectId,
							folderId: folder.id,
						}),
			),
		onSuccess: () => setRemoveTarget(null),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const rename = useMutation({
		mutationFn: ({ folder, name }: { folder: ProjectFolder; name: string }) =>
			runOptimistically(
				folders.map((candidate) =>
					candidate.id === folder.id
						? { ...candidate, folder: name }
						: candidate,
				),
				() =>
					client().project.folders.rename.mutate({
						projectId,
						folderId: folder.id,
						folder: name,
					}),
			),
		onSuccess: () => setRenameTarget(null),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const add = useMutation({
		mutationFn: async (repoPath: string): Promise<{ folder: string }> => {
			const host = client();
			if (!groupId) {
				const result = await host.project.folders.add.mutate({
					projectId,
					repoPath,
				});
				return { folder: result.folder.folder };
			}
			const repositories = await host.project.list.query();
			const existing = repositories.find(
				(repository) => repository.repoPath === repoPath,
			);
			const repositoryName =
				repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? repoPath;
			const memberProjectId =
				existing?.id ??
				(
					await host.project.create.mutate({
						name: repositoryName,
						mode: { kind: "importLocal", repoPath },
					})
				).projectId;
			const { group } = await host.projectGroups.addMember.mutate({
				groupId,
				projectId: memberProjectId,
			});
			return { folder: group.members.at(-1)?.folder ?? repoPath };
		},
		onSuccess: (result) => {
			toast.success(t({ message: `Added ${result.folder} to this project` }));
			invalidate();
			// The second folder moves the project's settings to the Project page;
			// this one is about to become a source folder's page.
			if (groupId && folders.length === 1) {
				void navigate({
					to: "/settings/projects/group/$groupId",
					params: { groupId },
					replace: true,
				});
			}
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const isBusy =
		setPrimary.isPending ||
		remove.isPending ||
		rename.isPending ||
		add.isPending;

	const handleAdd = async () => {
		if (isRemoteTarget) {
			setBrowseOpen(true);
			return;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select a repository to add" }),
			});
			if (picked.canceled || !picked.path) return;
			add.mutate(picked.path);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<SettingsSection
			title={t({ message: "Source folders" })}
			description={t({
				message:
					"Repositories checked out into every workspace for this project. The primary is the one single-repository tools use.",
			})}
		>
			<div className="divide-y rounded-md border">
				{folders.map((folder) => (
					<SourceFolderRow
						key={folder.id}
						folder={folder}
						isPrimary={folder.position === 0}
						disabled={isBusy}
						onMakePrimary={() => setPrimary.mutate(folder)}
						onRename={groupId ? undefined : () => setRenameTarget(folder)}
						onRemove={() => setRemoveTarget(folder)}
					/>
				))}
				{folders.length === 0 && (
					<p className="px-3 py-3 text-sm text-muted-foreground">
						{foldersQuery.isLoading ? (
							<Trans>Loading folders…</Trans>
						) : (
							<Trans>This project has no folders on {hostName} yet.</Trans>
						)}
					</p>
				)}
				<div className="px-3 py-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="gap-2"
						onClick={handleAdd}
						disabled={!hostUrl || !isProjectSetup || isBusy}
					>
						<LuPlus className="size-4" />
						<Trans>Add folder</Trans>
					</Button>
				</div>
			</div>

			<RenameFolderDialog
				folder={renameTarget}
				takenNames={folders.map((folder) => folder.folder)}
				isSubmitting={rename.isPending}
				onOpenChange={(open) => {
					if (!open) setRenameTarget(null);
				}}
				onSubmit={(name) => {
					if (renameTarget) rename.mutate({ folder: renameTarget, name });
				}}
			/>

			<RemoveFolderDialog
				folder={removeTarget}
				isSubmitting={remove.isPending}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				onConfirm={() => {
					if (removeTarget) remove.mutate(removeTarget);
				}}
			/>

			<RemotePathPicker
				open={browseOpen}
				onOpenChange={setBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				title={t({ message: "Add a repository folder" })}
				description={t({
					message: `Pick a repository on ${hostName} to add to this project.`,
				})}
				confirmLabel={t({ message: "Use this folder" })}
				onPick={(path) => add.mutate(path)}
			/>
		</SettingsSection>
	);
}
