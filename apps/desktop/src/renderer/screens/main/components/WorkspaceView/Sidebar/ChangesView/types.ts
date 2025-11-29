import type { ChangedFile as TRPCChangedFile } from "lib/trpc/routers/diff/types";

export type { TRPCChangedFile as ChangedFile };

export interface FileTreeNode {
	/** Node name (folder or file name) */
	name: string;
	/** Full path from root */
	path: string;
	/** Whether this is a folder */
	isFolder: boolean;
	/** Child nodes (for folders) */
	children?: FileTreeNode[];
	/** File data (for files) */
	file?: TRPCChangedFile;
}

export interface FileTreeProps {
	/** List of changed files from git */
	files: TRPCChangedFile[];
	/** Callback when a file is clicked (scrolls to it in diff viewer) */
	onFileClick: (path: string) => void;
	/** Set of expanded folder paths */
	expandedFolders: Set<string>;
	/** Callback to toggle folder expansion */
	onToggleFolder: (path: string) => void;
}

export interface FileNodeProps {
	/** The file data */
	file: TRPCChangedFile;
	/** Nesting depth for indentation */
	depth: number;
	/** Callback when clicked */
	onClick: () => void;
}

export interface FolderNodeProps {
	/** Folder node data */
	node: FileTreeNode;
	/** Nesting depth for indentation */
	depth: number;
	/** Whether this folder is expanded */
	isExpanded: boolean;
	/** Callback to toggle expansion */
	onToggle: () => void;
	/** Children to render inside */
	children: React.ReactNode;
}
