interface GetEditorDirtyStateParams {
	nextValue: string;
	originalContent: string;
	loadedContent: string;
}

interface GetEditorDirtyStateResult {
	isDirty: boolean;
	normalizedOriginalContent: string;
}

export function getEditorDirtyState({
	nextValue,
	originalContent,
	loadedContent,
}: GetEditorDirtyStateParams): GetEditorDirtyStateResult {
	const normalizedOriginalContent =
		originalContent === "" ? loadedContent : originalContent;

	return {
		isDirty: nextValue !== normalizedOriginalContent,
		normalizedOriginalContent,
	};
}
