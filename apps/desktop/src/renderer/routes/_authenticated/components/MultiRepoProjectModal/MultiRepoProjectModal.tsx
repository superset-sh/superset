import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HOST_PROJECT_GROUPS_QUERY_PREFIX } from "renderer/hooks/host-projects/useHostProjectGroups";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MultiRepoProjectForm } from "./components/MultiRepoProjectForm";
import {
	type AttachedSourceFolder,
	appendFolder,
	createProjectWithSourceFolders,
	type ProjectCreationClient,
	removeFolder,
	type SelectedFolder,
} from "./MultiRepoProjectModal.utils";

interface MultiRepoProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (result: { projectId: string }) => void;
}

export function MultiRepoProjectModal({
	open,
	onOpenChange,
	onSuccess,
}: MultiRepoProjectModalProps) {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const queryClient = useQueryClient();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const [name, setName] = useState("");
	const [folders, setFolders] = useState<SelectedFolder[]>([]);
	const [working, setWorking] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [groupId, setGroupId] = useState<string | null>(null);
	const [attached, setAttached] = useState<AttachedSourceFolder[]>([]);

	const reset = () => {
		setName("");
		setFolders([]);
		setWorking(false);
		setFailure(null);
		setGroupId(null);
		setAttached([]);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleAddFolder = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select a source folder" }),
			});
			if (picked.canceled || !picked.path) return;
			const path = picked.path;
			if (folders.some((folder) => folder.path === path)) {
				toast.error(t({ message: "That folder is already in the list" }));
				return;
			}
			setFolders(appendFolder(folders, path));
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	const createProject = async () => {
		const primary = folders[0];
		if (!primary) return;

		setWorking(true);
		setFailure(null);
		try {
			const hostUrl = await hostService.waitForHostReady();
			if (!hostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "createProject",
				});
				return;
			}
			const host = getHostServiceClientByUrl(hostUrl);
			const client: ProjectCreationClient = {
				createProject: async (projectName) => ({
					groupId: (
						await host.projectGroups.create.mutate({ name: projectName })
					).group.id,
				}),
				resolveRepository: (folder) =>
					host.project.create.mutate({
						name: folder.name,
						mode: { kind: "importLocal", repoPath: folder.path },
					}),
				addSourceFolder: async (input) => {
					await host.projectGroups.addMember.mutate(input);
				},
			};

			const result = await createProjectWithSourceFolders({
				client,
				name: name.trim() || primary.name,
				folders,
				previousAttempt: { groupId, attached },
			});
			setGroupId(result.groupId);
			setAttached(result.attached);
			void queryClient.invalidateQueries({
				queryKey: HOST_PROJECT_GROUPS_QUERY_PREFIX,
			});

			if (result.status === "failed") {
				setFailure(
					result.folder
						? t({
								message: `"${result.folder.name}" could not be added: ${errorMessage(result.error)}. The source folders added before it were kept — remove it or fix it and create again.`,
							})
						: t({
								message: `Could not create the project: ${errorMessage(result.error)}`,
							}),
				);
				return;
			}

			finalizeSetup(hostUrl, {
				projectId: result.primaryProjectId,
				repoPath: result.primaryRepoPath,
			});
			onSuccess({ projectId: result.primaryProjectId });
			reset();
			onOpenChange(false);
		} catch (error) {
			setFailure(errorMessage(error));
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[520px]">
				<DialogHeader>
					<DialogTitle>
						<Trans>Create project</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Add the repositories this project works across as source folders.
							Every workspace checks out all of them.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<MultiRepoProjectForm
					name={name}
					folders={folders}
					committedPaths={attached.map((entry) => entry.path)}
					failure={failure}
					isWorking={working}
					isPicking={selectDirectory.isPending}
					onNameChange={setName}
					onAddFolder={() => void handleAddFolder()}
					onRemoveFolder={(path) => setFolders(removeFolder(folders, path))}
					onCancel={() => handleOpenChange(false)}
					onCreate={() => void createProject()}
				/>
			</DialogContent>
		</Dialog>
	);
}
