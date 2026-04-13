import { languageDiagnosticsStore } from "../diagnostics-store";
import type {
	LanguageServiceCallHierarchyItem,
	LanguageServiceDiagnostic,
	LanguageServiceDocument,
	LanguageServiceHover,
	LanguageServiceIncomingCall,
	LanguageServiceLocation,
	LanguageServiceMarkupContent,
	LanguageServiceProvider,
	LanguageServiceProviderSummary,
	LanguageServiceRange,
	LanguageServiceRelatedInformation,
} from "../types";
import {
	absolutePathToFileUri,
	fileUriToAbsolutePath,
	lspSeverityToLanguageServiceSeverity,
	offsetToLspPosition,
	toRelativeWorkspacePath,
} from "../utils";
import type { ResolvedLspCommand } from "./command-resolvers";
import { StdioJsonRpcClient } from "./StdioJsonRpcClient";

type OpenDocumentEntry = {
	languageId: string;
	version: number;
	content: string;
	uri: string;
};

type LspDiagnostic = {
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	severity?: number;
	code?: string | number | { value?: string | number };
	source?: string;
	message: string;
	relatedInformation?: Array<{
		location: {
			uri: string;
			range: {
				start: { line: number; character: number };
				end: { line: number; character: number };
			};
		};
		message: string;
	}>;
};

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspLocation = { uri: string; range: LspRange };
type LspLocationLink = {
	targetUri: string;
	targetRange: LspRange;
	targetSelectionRange?: LspRange;
};
type LspMarkupContent = {
	kind?: string;
	value?: string;
};
type LspMarkedString = string | { language?: string; value?: string };
type LspHover = {
	contents?: LspMarkupContent | LspMarkedString | LspMarkedString[];
	range?: LspRange;
};

type WorkspaceSession = {
	workspaceId: string;
	workspacePath: string;
	client: StdioJsonRpcClient;
	openDocuments: Map<string, OpenDocumentEntry>;
	lastError: string | null;
	textDocumentSyncMode: "full" | "incremental";
};

type ProviderArgs = {
	workspaceId: string;
	workspacePath: string;
};

type RefreshRequest = {
	method: string;
	params?: unknown | ((args: ProviderArgs) => unknown);
};

type ExternalLspProviderOptions = {
	id: string;
	label: string;
	description: string;
	languageIds: string[];
	resolveServerCommand:
		| ((args: ProviderArgs) => Promise<ResolvedLspCommand | null>)
		| ((args: ProviderArgs) => ResolvedLspCommand | null);
	mapDocumentLanguageId?: (languageId: string) => string;
	initializationOptions?: unknown | ((args: ProviderArgs) => unknown);
	configuration?: unknown | ((args: ProviderArgs) => unknown);
	refreshRequest?: RefreshRequest | null;
	clientCapabilities?: unknown;
	defaultSource?: string;
};

function resolveTextDocumentSyncMode(result: unknown): "full" | "incremental" {
	const textDocumentSync = (
		result as {
			capabilities?: {
				textDocumentSync?:
					| number
					| {
							change?: number;
					  };
			};
		}
	)?.capabilities?.textDocumentSync;

	if (typeof textDocumentSync === "number") {
		return textDocumentSync === 2 ? "incremental" : "full";
	}

	if (
		textDocumentSync &&
		typeof textDocumentSync === "object" &&
		textDocumentSync.change === 2
	) {
		return "incremental";
	}

	return "full";
}

function getSectionValue(
	configuration: unknown,
	section?: string | null,
): unknown {
	if (!section) {
		return configuration ?? null;
	}

	const keys = section.split(".");
	let current: unknown = configuration;
	for (const key of keys) {
		if (!current || typeof current !== "object") {
			return null;
		}

		current = (current as Record<string, unknown>)[key];
		if (current === undefined) {
			return null;
		}
	}

	return current;
}

function lspRangeToLanguageServiceRange(
	range: LspRange | undefined,
): LanguageServiceRange | null {
	if (!range) {
		return null;
	}

	return {
		line: range.start.line + 1,
		column: range.start.character + 1,
		endLine: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

function lspLocationToLanguageServiceLocation(
	location: LspLocation | LspLocationLink,
): LanguageServiceLocation | null {
	const targetUri = "targetUri" in location ? location.targetUri : location.uri;
	const targetRange =
		"targetUri" in location
			? (location.targetSelectionRange ?? location.targetRange)
			: location.range;
	const absolutePath = fileUriToAbsolutePath(targetUri);
	if (!absolutePath) {
		return null;
	}

	return {
		absolutePath,
		line: targetRange.start.line + 1,
		column: targetRange.start.character + 1,
		endLine: targetRange.end.line + 1,
		endColumn: targetRange.end.character + 1,
	};
}

function normalizeMarkedString(
	value: LspMarkedString,
): LanguageServiceMarkupContent | null {
	if (typeof value === "string") {
		return value
			? {
					kind: "plaintext",
					value,
				}
			: null;
	}

	if (value.language && value.value) {
		return {
			kind: "markdown",
			value: `\`\`\`${value.language}\n${value.value}\n\`\`\``,
		};
	}

	if (value.value) {
		return {
			kind: "plaintext",
			value: value.value,
		};
	}

	return null;
}

function normalizeLspHoverContents(
	contents: LspHover["contents"],
): LanguageServiceMarkupContent[] {
	if (!contents) {
		return [];
	}

	if (Array.isArray(contents)) {
		return contents
			.map((item) => normalizeMarkedString(item))
			.filter((item): item is LanguageServiceMarkupContent => item !== null);
	}

	if (typeof contents === "string") {
		const normalized = normalizeMarkedString(contents);
		return normalized ? [normalized] : [];
	}

	if ("language" in contents) {
		const normalized = normalizeMarkedString(contents);
		return normalized ? [normalized] : [];
	}

	const markup = contents as LspMarkupContent;
	if (markup.value) {
		return [
			{
				kind: markup.kind === "markdown" ? "markdown" : "plaintext",
				value: markup.value,
			},
		];
	}

	return [];
}

export class ExternalLspLanguageProvider implements LanguageServiceProvider {
	readonly id: string;

	readonly label: string;

	readonly description: string;

	readonly languageIds: string[];

	private readonly sessions = new Map<string, WorkspaceSession>();

	private readonly pendingSessions = new Map<
		string,
		Promise<WorkspaceSession>
	>();

	private readonly workspaceErrors = new Map<string, string | null>();

	constructor(private readonly options: ExternalLspProviderOptions) {
		this.id = options.id;
		this.label = options.label;
		this.description = options.description;
		this.languageIds = options.languageIds;
	}

	supportsLanguage(languageId: string): boolean {
		return this.languageIds.includes(languageId);
	}

	async openDocument(document: LanguageServiceDocument): Promise<void> {
		const session = await this.ensureSession(
			document.workspaceId,
			document.workspacePath,
		);
		const uri = absolutePathToFileUri(document.absolutePath);
		session.openDocuments.set(document.absolutePath, {
			languageId: document.languageId,
			version: document.version,
			content: document.content,
			uri,
		});
		await session.client.notify("textDocument/didOpen", {
			textDocument: {
				uri,
				languageId: this.mapDocumentLanguageId(document.languageId),
				version: document.version,
				text: document.content,
			},
		});
	}

	async changeDocument(document: LanguageServiceDocument): Promise<void> {
		const session = await this.ensureSession(
			document.workspaceId,
			document.workspacePath,
		);
		const previous = session.openDocuments.get(document.absolutePath);
		if (!previous) {
			await this.openDocument(document);
			return;
		}

		session.openDocuments.set(document.absolutePath, {
			languageId: document.languageId,
			version: document.version,
			content: document.content,
			uri: previous.uri,
		});

		await this.sendDidChange(
			session,
			previous,
			document.version,
			document.content,
		);
	}

	async closeDocument(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		languageId: string;
	}): Promise<void> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) {
			return;
		}

		const existing = session.openDocuments.get(args.absolutePath);
		session.openDocuments.delete(args.absolutePath);
		languageDiagnosticsStore.clearFileDiagnostics(
			args.workspaceId,
			this.fileKey(args.absolutePath),
		);

		if (existing) {
			await session.client.notify("textDocument/didClose", {
				textDocument: {
					uri: existing.uri,
				},
			});
		}

		if (session.openDocuments.size === 0) {
			await this.disposeWorkspace(args);
		}
	}

	async refreshWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) {
			return;
		}

		try {
			const configuration = this.resolveConfiguration(args);
			if (configuration !== null) {
				await session.client.notify("workspace/didChangeConfiguration", {
					settings: configuration,
				});
			}

			if (this.options.refreshRequest) {
				const refreshParams =
					typeof this.options.refreshRequest.params === "function"
						? this.options.refreshRequest.params(args)
						: this.options.refreshRequest.params;
				await session.client.request(
					this.options.refreshRequest.method,
					refreshParams,
				);
			} else {
				for (const entry of session.openDocuments.values()) {
					await this.sendDidChange(
						session,
						entry,
						entry.version,
						entry.content,
					);
				}
			}
			session.lastError = null;
			this.workspaceErrors.delete(args.workspaceId);
		} catch (error) {
			session.lastError =
				error instanceof Error ? error.message : String(error);
			this.workspaceErrors.set(args.workspaceId, session.lastError);
		}
	}

	getWorkspaceSummary(args: {
		workspaceId: string;
		workspacePath: string;
		enabled: boolean;
	}): LanguageServiceProviderSummary {
		const session = this.sessions.get(args.workspaceId);
		const lastError =
			session?.lastError ?? this.workspaceErrors.get(args.workspaceId) ?? null;

		if (!args.enabled) {
			return {
				providerId: this.id,
				label: this.label,
				status: "disabled",
				details: null,
				documentCount: 0,
			};
		}

		if (!session) {
			return {
				providerId: this.id,
				label: this.label,
				status: lastError ? "error" : "idle",
				details: lastError,
				documentCount: 0,
			};
		}

		return {
			providerId: this.id,
			label: this.label,
			status: lastError ? "error" : "ready",
			details: lastError,
			documentCount: session.openDocuments.size,
		};
	}

	async disposeWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		const session = this.sessions.get(args.workspaceId);
		if (session) {
			await session.client.stop();
			this.sessions.delete(args.workspaceId);
		}

		this.workspaceErrors.delete(args.workspaceId);
	}

	async findReferences(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) return null;

		try {
			const result = (await session.client.request("textDocument/references", {
				textDocument: {
					uri: absolutePathToFileUri(args.absolutePath),
				},
				position: {
					line: args.line - 1,
					character: args.column - 1,
				},
				context: { includeDeclaration: true },
			})) as Array<{
				uri: string;
				range: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
			}> | null;

			if (!result) return null;

			return result
				.map((loc) => {
					const absPath = fileUriToAbsolutePath(loc.uri);
					if (!absPath) return null;
					return {
						absolutePath: absPath,
						line: loc.range.start.line + 1,
						column: loc.range.start.character + 1,
						endLine: loc.range.end.line + 1,
						endColumn: loc.range.end.character + 1,
					};
				})
				.filter((loc): loc is LanguageServiceLocation => loc !== null);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(args.workspaceId, message);
			return null;
		}
	}

	async getHover(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceHover | null> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) return null;

		try {
			const result = (await session.client.request("textDocument/hover", {
				textDocument: {
					uri: absolutePathToFileUri(args.absolutePath),
				},
				position: {
					line: args.line - 1,
					character: args.column - 1,
				},
			})) as LspHover | null;

			const contents = normalizeLspHoverContents(result?.contents);
			if (contents.length === 0) {
				return null;
			}

			session.lastError = null;
			this.workspaceErrors.delete(args.workspaceId);
			return {
				contents,
				range: lspRangeToLanguageServiceRange(result?.range),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(args.workspaceId, message);
			return null;
		}
	}

	async getDefinition(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceLocation[] | null> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) return null;

		try {
			const result = (await session.client.request("textDocument/definition", {
				textDocument: {
					uri: absolutePathToFileUri(args.absolutePath),
				},
				position: {
					line: args.line - 1,
					character: args.column - 1,
				},
			})) as
				| LspLocation
				| LspLocationLink
				| Array<LspLocation | LspLocationLink>
				| null;

			const locations = (
				Array.isArray(result) ? result : result ? [result] : []
			)
				.map((location) => lspLocationToLanguageServiceLocation(location))
				.filter(
					(location): location is LanguageServiceLocation => location !== null,
				);

			if (locations.length === 0) {
				return null;
			}

			session.lastError = null;
			this.workspaceErrors.delete(args.workspaceId);
			return locations;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(args.workspaceId, message);
			return null;
		}
	}

	async prepareCallHierarchy(args: {
		workspaceId: string;
		workspacePath: string;
		absolutePath: string;
		line: number;
		column: number;
	}): Promise<LanguageServiceCallHierarchyItem[] | null> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) return null;

		try {
			const result = (await session.client.request(
				"textDocument/prepareCallHierarchy",
				{
					textDocument: {
						uri: absolutePathToFileUri(args.absolutePath),
					},
					position: {
						line: args.line - 1,
						character: args.column - 1,
					},
				},
			)) as Array<{
				name: string;
				kind: number;
				uri: string;
				range: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
				selectionRange: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
			}> | null;

			if (!result) return null;

			return result
				.map((item) => {
					const absPath = fileUriToAbsolutePath(item.uri);
					if (!absPath) return null;
					return {
						name: item.name,
						kind: String(item.kind),
						absolutePath: absPath,
						line: item.range.start.line + 1,
						column: item.range.start.character + 1,
						endLine: item.range.end.line + 1,
						endColumn: item.range.end.character + 1,
						selectionLine: item.selectionRange.start.line + 1,
						selectionColumn: item.selectionRange.start.character + 1,
						selectionEndLine: item.selectionRange.end.line + 1,
						selectionEndColumn: item.selectionRange.end.character + 1,
					};
				})
				.filter(
					(item): item is LanguageServiceCallHierarchyItem => item !== null,
				);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(args.workspaceId, message);
			return null;
		}
	}

	async getIncomingCalls(args: {
		workspaceId: string;
		item: LanguageServiceCallHierarchyItem;
	}): Promise<LanguageServiceIncomingCall[] | null> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) return null;

		try {
			const lspItem = {
				name: args.item.name,
				kind: Number(args.item.kind),
				uri: absolutePathToFileUri(args.item.absolutePath),
				range: {
					start: {
						line: args.item.line - 1,
						character: args.item.column - 1,
					},
					end: {
						line: args.item.endLine - 1,
						character: args.item.endColumn - 1,
					},
				},
				selectionRange: {
					start: {
						line: args.item.selectionLine - 1,
						character: args.item.selectionColumn - 1,
					},
					end: {
						line: args.item.selectionEndLine - 1,
						character: args.item.selectionEndColumn - 1,
					},
				},
			};

			const result = (await session.client.request(
				"callHierarchy/incomingCalls",
				{ item: lspItem },
			)) as Array<{
				from: {
					name: string;
					kind: number;
					uri: string;
					range: {
						start: { line: number; character: number };
						end: { line: number; character: number };
					};
					selectionRange: {
						start: { line: number; character: number };
						end: { line: number; character: number };
					};
				};
				fromRanges: Array<{
					start: { line: number; character: number };
					end: { line: number; character: number };
				}>;
			}> | null;

			if (!result) return null;

			return result
				.map((call) => {
					const fromPath = fileUriToAbsolutePath(call.from.uri);
					if (!fromPath) return null;
					return {
						from: {
							name: call.from.name,
							kind: String(call.from.kind),
							absolutePath: fromPath,
							line: call.from.range.start.line + 1,
							column: call.from.range.start.character + 1,
							endLine: call.from.range.end.line + 1,
							endColumn: call.from.range.end.character + 1,
							selectionLine: call.from.selectionRange.start.line + 1,
							selectionColumn: call.from.selectionRange.start.character + 1,
							selectionEndLine: call.from.selectionRange.end.line + 1,
							selectionEndColumn: call.from.selectionRange.end.character + 1,
						},
						fromRanges: call.fromRanges.map((r) => ({
							line: r.start.line + 1,
							column: r.start.character + 1,
							endLine: r.end.line + 1,
							endColumn: r.end.character + 1,
						})),
					};
				})
				.filter((call): call is LanguageServiceIncomingCall => call !== null);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(args.workspaceId, message);
			return null;
		}
	}

	private async ensureSession(
		workspaceId: string,
		workspacePath: string,
	): Promise<WorkspaceSession> {
		const existing = this.sessions.get(workspaceId);
		if (existing) {
			return existing;
		}

		const pending = this.pendingSessions.get(workspaceId);
		if (pending) {
			return pending;
		}

		const promise = this.initSession(workspaceId, workspacePath);
		this.pendingSessions.set(workspaceId, promise);
		try {
			return await promise;
		} finally {
			this.pendingSessions.delete(workspaceId);
		}
	}

	private async initSession(
		workspaceId: string,
		workspacePath: string,
	): Promise<WorkspaceSession> {
		const resolvedCommand = await this.options.resolveServerCommand({
			workspaceId,
			workspacePath,
		});
		if (!resolvedCommand) {
			const message = `${this.label} language server is not available in this environment.`;
			this.workspaceErrors.set(workspaceId, message);
			throw new Error(message);
		}

		let session!: WorkspaceSession;
		const client = new StdioJsonRpcClient({
			name: `${this.id}:${workspaceId}`,
			command: resolvedCommand.command,
			args: resolvedCommand.args,
			cwd: resolvedCommand.cwd ?? workspacePath,
			env: resolvedCommand.env ?? process.env,
			shell: resolvedCommand.shell,
			onNotification: (message) => {
				this.handleNotification(session, message);
			},
			onRequest: async (message) =>
				await this.handleServerRequest(session, message),
			onExit: ({ code, signal }) => {
				const error = `${this.label} language server exited (${code ?? "null"}${signal ? `, ${signal}` : ""})`;
				session.lastError = error;
				this.workspaceErrors.set(workspaceId, error);
				this.sessions.delete(workspaceId);
			},
			onStderr: (chunk) => {
				console.error(`[language-services/${this.id}] stderr`, {
					workspaceId,
					chunk,
				});
			},
		});

		session = {
			workspaceId,
			workspacePath,
			client,
			openDocuments: new Map(),
			lastError: null,
			textDocumentSyncMode: "full",
		};

		try {
			await client.start();
			const workspaceUri = absolutePathToFileUri(workspacePath);
			const initializeResult = await client.request("initialize", {
				processId: process.pid,
				clientInfo: {
					name: "Superset Desktop",
					version: "1.4.6",
				},
				rootUri: workspaceUri,
				rootPath: workspacePath,
				workspaceFolders: [
					{
						uri: workspaceUri,
						name: this.workspaceFolderName(workspacePath),
					},
				],
				capabilities: this.options.clientCapabilities ?? {
					workspace: {
						configuration: true,
						workspaceFolders: true,
					},
					textDocument: {
						publishDiagnostics: {
							relatedInformation: true,
						},
						hover: {
							contentFormat: ["markdown", "plaintext"],
						},
						definition: {
							linkSupport: true,
						},
						references: {
							dynamicRegistration: false,
						},
						callHierarchy: {
							dynamicRegistration: false,
						},
						documentSymbol: {
							dynamicRegistration: false,
						},
					},
				},
				initializationOptions: this.resolveInitializationOptions({
					workspaceId,
					workspacePath,
				}),
			});
			await client.notify("initialized", {});
			session.textDocumentSyncMode =
				resolveTextDocumentSyncMode(initializeResult);
			session.lastError = null;
			this.workspaceErrors.delete(workspaceId);
			this.sessions.set(workspaceId, session);
			return session;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			session.lastError = message;
			this.workspaceErrors.set(workspaceId, message);
			await client.stop();
			throw error;
		}
	}

	private async sendDidChange(
		session: WorkspaceSession,
		previous: OpenDocumentEntry,
		version: number,
		content: string,
	): Promise<void> {
		await session.client.notify("textDocument/didChange", {
			textDocument: {
				uri: previous.uri,
				version,
			},
			contentChanges:
				session.textDocumentSyncMode === "incremental"
					? [
							{
								range: {
									start: { line: 0, character: 0 },
									end: offsetToLspPosition(
										previous.content,
										previous.content.length,
									),
								},
								text: content,
							},
						]
					: [
							{
								text: content,
							},
						],
		});
	}

	private handleNotification(
		session: WorkspaceSession,
		message: {
			method: string;
			params?: unknown;
		},
	): void {
		if (message.method !== "textDocument/publishDiagnostics") {
			return;
		}

		const params = message.params as
			| {
					uri?: string;
					diagnostics?: LspDiagnostic[];
			  }
			| undefined;
		if (!params?.uri) {
			return;
		}

		const absolutePath = fileUriToAbsolutePath(params.uri);
		if (!absolutePath) {
			return;
		}

		languageDiagnosticsStore.setFileDiagnostics(
			session.workspaceId,
			this.fileKey(absolutePath),
			(params.diagnostics ?? []).map((diagnostic) =>
				this.mapDiagnostic(session.workspacePath, absolutePath, diagnostic),
			),
		);
	}

	private async handleServerRequest(
		session: WorkspaceSession,
		message: {
			method: string;
			params?: unknown;
		},
	): Promise<unknown> {
		switch (message.method) {
			case "workspace/configuration": {
				const items = ((
					message.params as {
						items?: Array<{ section?: string | null }> | null;
					}
				)?.items ?? []) as Array<{ section?: string | null }>;
				const configuration = this.resolveConfiguration({
					workspaceId: session.workspaceId,
					workspacePath: session.workspacePath,
				});
				return items.map((item) =>
					getSectionValue(configuration, item.section),
				);
			}
			case "workspace/workspaceFolders":
				return [
					{
						uri: absolutePathToFileUri(session.workspacePath),
						name: this.workspaceFolderName(session.workspacePath),
					},
				];
			case "client/registerCapability":
			case "client/unregisterCapability":
			case "window/workDoneProgress/create":
				return null;
			default:
				return undefined;
		}
	}

	private mapDiagnostic(
		workspacePath: string,
		absolutePath: string,
		diagnostic: LspDiagnostic,
	): LanguageServiceDiagnostic {
		const relatedInformation = (
			diagnostic.relatedInformation ?? []
		).map<LanguageServiceRelatedInformation>((item) => {
			const relatedAbsolutePath = fileUriToAbsolutePath(item.location.uri);
			return {
				absolutePath: relatedAbsolutePath,
				relativePath: relatedAbsolutePath
					? toRelativeWorkspacePath(workspacePath, relatedAbsolutePath)
					: null,
				line: item.location.range.start.line + 1,
				column: item.location.range.start.character + 1,
				endLine: item.location.range.end.line + 1,
				endColumn: item.location.range.end.character + 1,
				message: item.message,
			};
		});

		return {
			providerId: this.id,
			source: diagnostic.source ?? this.options.defaultSource ?? this.id,
			absolutePath,
			relativePath: toRelativeWorkspacePath(workspacePath, absolutePath),
			line: diagnostic.range.start.line + 1,
			column: diagnostic.range.start.character + 1,
			endLine: diagnostic.range.end.line + 1,
			endColumn: diagnostic.range.end.character + 1,
			message: diagnostic.message,
			code:
				typeof diagnostic.code === "object"
					? (diagnostic.code?.value ?? null)
					: (diagnostic.code ?? null),
			severity: lspSeverityToLanguageServiceSeverity(diagnostic.severity),
			relatedInformation,
		};
	}

	private resolveInitializationOptions(args: ProviderArgs): unknown {
		return typeof this.options.initializationOptions === "function"
			? this.options.initializationOptions(args)
			: this.options.initializationOptions;
	}

	private resolveConfiguration(args: ProviderArgs): unknown {
		return typeof this.options.configuration === "function"
			? this.options.configuration(args)
			: (this.options.configuration ?? null);
	}

	private mapDocumentLanguageId(languageId: string): string {
		return this.options.mapDocumentLanguageId?.(languageId) ?? languageId;
	}

	private workspaceFolderName(workspacePath: string): string {
		return workspacePath.split(/[\\/]/).at(-1) || workspacePath;
	}

	private fileKey(absolutePath: string): string {
		return `${this.id}::${absolutePath}`;
	}
}
