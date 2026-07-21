import { FolderInputIcon, LayoutTemplateIcon, PlusIcon } from "lucide-react";
import { useAddRepositoryModalStore } from "renderer/stores/add-repository-modal";
import { useFolderImportIntent } from "renderer/stores/folder-import-intent";
import type { Command, CommandProvider } from "../../core/types";

export const addProjectProvider: CommandProvider = {
	id: "add-project",
	provide: () => {
		const commands: Command[] = [
			{
				id: "addProject.cloneFromUrl",
				title: "Clone from URL",
				section: "add-project",
				icon: PlusIcon,
				keywords: ["add project", "repository", "repo", "git", "clone"],
				run: () => {
					void useAddRepositoryModalStore.getState().openNewProject();
				},
			},
			{
				id: "addProject.openFromFolder",
				title: "Open from folder",
				section: "add-project",
				icon: FolderInputIcon,
				keywords: ["add project", "import", "local", "directory"],
				run: () => useFolderImportIntent.getState().request(),
			},
			{
				id: "addProject.startFromTemplate",
				title: "Start from a template",
				section: "add-project",
				icon: LayoutTemplateIcon,
				keywords: ["add project", "new", "gallery", "starter"],
				run: () => {
					void useAddRepositoryModalStore.getState().openTemplateGallery();
				},
			},
		];
		return commands;
	},
};
