interface GetFileDiffSaveContentParams {
	editorValue: string | null | undefined;
	editedContent: string | null;
	modifiedContent: string;
}

export function getFileDiffSaveContent({
	editorValue,
	editedContent,
	modifiedContent,
}: GetFileDiffSaveContentParams): string {
	return editorValue ?? editedContent ?? modifiedContent;
}
