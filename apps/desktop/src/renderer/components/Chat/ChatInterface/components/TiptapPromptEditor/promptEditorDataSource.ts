export interface PromptEditorFileResult {
	id: string;
	name: string;
	relativePath: string;
}

export interface PromptEditorSlashPreview {
	commandName?: string;
	prompt?: string;
}

export interface PromptEditorDataSource {
	useFileSearch: (args: {
		query: string;
		enabled: boolean;
	}) => PromptEditorFileResult[];
	useSlashPreview: (args: {
		text: string;
		enabled: boolean;
	}) => PromptEditorSlashPreview | null;
}
