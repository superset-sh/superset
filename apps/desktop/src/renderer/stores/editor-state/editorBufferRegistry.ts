interface EditorBufferEntry {
	loadedContent: string;
	renderedMarkdownPristineContent: string | null;
	currentContent: string;
	initialized: boolean;
}

const documentBuffers = new Map<string, EditorBufferEntry>();

function ensureBuffer(documentKey: string): EditorBufferEntry {
	const existing = documentBuffers.get(documentKey);
	if (existing) {
		return existing;
	}

	const created: EditorBufferEntry = {
		loadedContent: "",
		renderedMarkdownPristineContent: null,
		currentContent: "",
		initialized: false,
	};
	documentBuffers.set(documentKey, created);
	return created;
}

export function hasDocumentBuffer(documentKey: string): boolean {
	return documentBuffers.has(documentKey);
}

export function getDocumentLoadedContent(documentKey: string): string {
	return documentBuffers.get(documentKey)?.loadedContent ?? "";
}

export function getDocumentCurrentContent(documentKey: string): string {
	return documentBuffers.get(documentKey)?.currentContent ?? "";
}

export function getDocumentRenderedMarkdownPristineContent(
	documentKey: string,
): string | null {
	return (
		documentBuffers.get(documentKey)?.renderedMarkdownPristineContent ?? null
	);
}

export function hasInitializedDocumentBuffer(documentKey: string): boolean {
	return documentBuffers.get(documentKey)?.initialized ?? false;
}

export function setDocumentLoadedContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	entry.loadedContent = content;
	entry.renderedMarkdownPristineContent = null;
	entry.currentContent = content;
	entry.initialized = true;
}

export function setDocumentCurrentContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	if (!entry.initialized) {
		entry.loadedContent = content;
		entry.renderedMarkdownPristineContent = null;
		entry.initialized = true;
	}
	entry.currentContent = content;
}

export function setDocumentRenderedMarkdownPristineContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	if (!entry.initialized) {
		entry.loadedContent = content;
		entry.currentContent = content;
		entry.initialized = true;
	}
	entry.renderedMarkdownPristineContent = content;
}

export function markDocumentSavedContent(
	documentKey: string,
	savedContent: string,
	currentContent: string,
): void {
	const entry = ensureBuffer(documentKey);
	entry.loadedContent = savedContent;
	entry.renderedMarkdownPristineContent = null;
	entry.currentContent = currentContent;
	entry.initialized = true;
}

export function discardDocumentCurrentContent(documentKey: string): string {
	const entry = ensureBuffer(documentKey);
	entry.currentContent = entry.loadedContent;
	return entry.currentContent;
}

export function transferDocumentBuffer(
	previousDocumentKey: string,
	nextDocumentKey: string,
): void {
	if (previousDocumentKey === nextDocumentKey) {
		return;
	}

	const previous = documentBuffers.get(previousDocumentKey);
	if (!previous) {
		return;
	}

	documentBuffers.set(nextDocumentKey, { ...previous });
	documentBuffers.delete(previousDocumentKey);
}

export function deleteDocumentBuffer(documentKey: string): void {
	documentBuffers.delete(documentKey);
}
