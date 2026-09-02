import { msg } from "@lingui/core/macro";
import {
	FolderInputIcon,
	FolderPlusIcon,
	LayoutTemplateIcon,
	PlusIcon,
} from "lucide-react";
import { useAddRepositoryModalStore } from "renderer/stores/add-repository-modal";
import { useFolderImportIntent } from "renderer/stores/folder-import-intent";
import type { Command, CommandProvider } from "../../core/types";

export const addProjectProvider: CommandProvider = {
	id: "add-project",
	provide: () => {
		const commands: Command[] = [
			{
				id: "addProject.createNew",
				title: msg({
					id: "commandPalette.addProject.createNew",
					message: "Create new project",
				}),
				section: "add-project",
				icon: FolderPlusIcon,
				keywords: ["add project", "new", "blank", "empty", "folder", "init"],
				run: () => {
					void useAddRepositoryModalStore.getState().openEmptyProject();
				},
			},
			{
				id: "addProject.cloneFromUrl",
				title: msg({
					id: "commandPalette.addProject.cloneFromUrl",
					message: "Clone from URL",
				}),
				section: "add-project",
				icon: PlusIcon,
				keywords: ["add project", "repository", "repo", "git", "clone"],
				run: () => {
					void useAddRepositoryModalStore.getState().openNewProject();
				},
			},
			{
				id: "addProject.openFromFolder",
				title: msg({
					id: "commandPalette.addProject.openFromFolder",
					message: "Open from folder",
				}),
				section: "add-project",
				icon: FolderInputIcon,
				keywords: ["add project", "import", "local", "directory"],
				run: () => useFolderImportIntent.getState().request(),
			},
			{
				id: "addProject.startFromTemplate",
				title: msg({
					id: "commandPalette.addProject.startFromTemplate",
					message: "Start from a template",
				}),
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
