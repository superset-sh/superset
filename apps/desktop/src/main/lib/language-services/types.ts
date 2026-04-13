export type LanguageServiceSeverity = "error" | "warning" | "info" | "hint";

export interface LanguageServiceRelatedInformation {
	absolutePath: string | null;
	relativePath: string | null;
	line: number | null;
	column: number | null;
	endLine: number | null;
	endColumn: number | null;
	message: string;
}

export interface LanguageServiceDocument {
	workspaceId: string;
	workspacePath: string;
	absolutePath: string;
	languageId: string;
	content: string;
	version: number;
}

export interface LanguageServiceDiagnostic {
	providerId: string;
	source: string;
	absolutePath: string | null;
	relativePath: string | null;
	line: number | null;
	column: number | null;
	endLine: number | null;
	endColumn: number | null;
	message: string;
	code: string | number | null;
	severity: LanguageServiceSeverity;
	relatedInformation?: LanguageServiceRelatedInformation[];
}

export interface LanguageServiceProviderSummary {
	providerId: string;
	label: string;
	status: "ready" | "disabled" | "idle" | "error";
	details?: string | null;
	documentCount: number;
}

export interface LanguageServiceProviderDescriptor {
	providerId: string;
	label: string;
	description: string;
	languageIds: string[];
	enabled: boolean;
}

export interface LanguageServiceWorkspaceSnapshot {
	status: "ready";
	workspaceId: string;
	workspacePath: string;
	providers: LanguageServiceProviderSummary[];
	problems: LanguageServiceDiagnostic[];
	totalCount: number;
	truncated: boolean;
	summary: {
		errorCount: number;
		warningCount: number;
		infoCount: number;
		hintCount: number;
	};
}

/**
 * Location of a symbol reference returned by findReferences / call hierarchy.
 */
export interface LanguageServiceLocation {
	absolutePath: string;
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
}

export interface LanguageServiceRange {
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
}

export interface LanguageServiceMarkupContent {
	kind: "plaintext" | "markdown";
	value: string;
}

export interface LanguageServiceHover {
	contents: LanguageServiceMarkupContent[];
	range: LanguageServiceRange | null;
}

/**
 * A call hierarchy item returned by prepareCallHierarchy.
 */
export interface LanguageServiceCallHierarchyItem {
	name: string;
	kind: string;
	absolutePath: string;
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
	selectionLine: number;
	selectionColumn: number;
	selectionEndLine: number;
	selectionEndColumn: number;
}

/**
 * An incoming call hierarchy entry.
 */
export interface LanguageServiceIncomingCall {
	from: LanguageServiceCallHierarchyItem;
	fromRanges: Array<{
		line: number;
		column: number;
		endLine: number;
		endColumn: number;
	}>;
}

export interface LanguageServiceProvider {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly languageIds: string[];
	supportsLanguage(languageId: string): boolean;
	openDocument(document: LanguageServiceDocument): Promise<void>;
	changeDocument(document: LanguageServiceDocument): Promise<void>;
	closeDocument(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
	}): Promise<void>;
	refreshWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void>;
	getWorkspaceSummary(args: {
		workspaceId: string;
		workspacePath: string;
		enabled: boolean;
	}): LanguageServiceProviderSummary;
	disposeWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void>;

	/**
	 * Find all references to a symbol at the given position.
	 * Returns null if the provider does not support this operation.
	 */
	findReferences?(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null>;

	/**
	 * Get hover content for a symbol at the given position.
	 * Returns null if the provider does not support this operation.
	 */
	getHover?(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceHover | null>;

	/**
	 * Get definitions for a symbol at the given position.
	 * Returns null if the provider does not support this operation.
	 */
	getDefinition?(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null>;

	/**
	 * Prepare call hierarchy at the given position.
	 * Returns null if the provider does not support this operation.
	 */
	prepareCallHierarchy?(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceCallHierarchyItem[] | null>;

	/**
	 * Get incoming calls for a call hierarchy item.
	 */
	getIncomingCalls?(args: {
		workspaceId: string;
		item: LanguageServiceCallHierarchyItem;
	}): Promise<LanguageServiceIncomingCall[] | null>;
}
