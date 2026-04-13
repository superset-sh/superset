import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { languageDiagnosticsStore } from "../../diagnostics-store";
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
	LanguageServiceSeverity,
} from "../../types";

const require = createRequire(import.meta.url);

type TsServerRequest = {
	seq: number;
	type: "request";
	command: string;
	arguments?: unknown;
};

type TsServerEvent = {
	type: "event";
	event: string;
	body?: unknown;
};

type TsServerResponse = {
	type: "response";
	request_seq: number;
	success: boolean;
	command: string;
	body?: unknown;
	message?: string;
};

type TsServerMessage = TsServerEvent | TsServerResponse;

type TsServerDiagnostic = {
	start?: { line: number; offset: number };
	end?: { line: number; offset: number };
	text?: string;
	message?: string;
	code?: number;
	category?: string;
	relatedInformation?: Array<{
		span?: {
			file?: string;
			start?: { line: number; offset: number };
			end?: { line: number; offset: number };
		};
		message?: string;
		text?: string;
	}>;
};

type DiagnosticBucketKey = "syntax" | "semantic" | "suggestion" | "config";

type FileDiagnosticBuckets = {
	syntax: LanguageServiceDiagnostic[];
	semantic: LanguageServiceDiagnostic[];
	suggestion: LanguageServiceDiagnostic[];
	config: LanguageServiceDiagnostic[];
};

type OpenDocumentEntry = {
	languageId: string;
	version: number;
	content: string;
};

type TsServerTextPart =
	| string
	| {
			text?: string;
	  };

type TsServerFileSpan = {
	file: string;
	start: { line: number; offset: number };
	end: { line: number; offset: number };
};

type TsServerQuickInfoResponse = {
	displayString?: string;
	documentation?: TsServerTextPart[] | string;
	tags?: Array<{
		name?: string;
		text?: TsServerTextPart[] | string;
	}>;
	start?: { line: number; offset: number };
	end?: { line: number; offset: number };
};

type WorkspaceSession = {
	workspaceId: string;
	workspacePath: string;
	tsserverPath: string;
	process: ChildProcessWithoutNullStreams;
	seq: number;
	buffer: string;
	requestResolvers: Map<
		number,
		{
			resolve: (value: TsServerResponse) => void;
			reject: (error: Error) => void;
		}
	>;
	openDocuments: Map<string, OpenDocumentEntry>;
	diagnosticBuckets: Map<string, FileDiagnosticBuckets>;
	getErrTimer: ReturnType<typeof setTimeout> | null;
	lastError: string | null;
};

function createEmptyBuckets(): FileDiagnosticBuckets {
	return {
		syntax: [],
		semantic: [],
		suggestion: [],
		config: [],
	};
}

function tryConsumeContentLengthMessage(
	buffer: string,
): { body: string; rest: string } | null {
	const normalizedBuffer = buffer.replace(/^(?:\r?\n)+/, "");
	if (normalizedBuffer !== buffer) {
		return tryConsumeContentLengthMessage(normalizedBuffer);
	}

	const separatorIndex = buffer.indexOf("\r\n\r\n");
	if (separatorIndex === -1) {
		return null;
	}

	const header = buffer.slice(0, separatorIndex);
	const contentLengthMatch = /Content-Length: (\d+)/i.exec(header);
	if (!contentLengthMatch) {
		return null;
	}

	const contentLength = Number(contentLengthMatch[1]);
	const bodyStart = separatorIndex + 4;
	const bodyEnd = bodyStart + contentLength;
	if (buffer.length < bodyEnd) {
		return null;
	}

	return {
		body: buffer.slice(bodyStart, bodyEnd),
		rest: buffer.slice(bodyEnd),
	};
}

function tryConsumeLineMessage(
	buffer: string,
): { body: string; rest: string } | null {
	const normalizedBuffer = buffer.replace(/^(?:\r?\n)+/, "");
	if (normalizedBuffer !== buffer) {
		return tryConsumeLineMessage(normalizedBuffer);
	}

	if (!normalizedBuffer.trimStart().startsWith("{")) {
		return null;
	}

	const newlineIndex = buffer.indexOf("\n");
	if (newlineIndex === -1) {
		return null;
	}

	return {
		body: buffer.slice(0, newlineIndex).trim(),
		rest: buffer.slice(newlineIndex + 1),
	};
}

function toRelativeWorkspacePath(
	workspacePath: string,
	absolutePath: string,
): string | null {
	const relativePath = path.relative(workspacePath, absolutePath);
	if (
		!relativePath ||
		relativePath.startsWith("..") ||
		path.isAbsolute(relativePath)
	) {
		return null;
	}

	return relativePath.split(path.sep).join("/");
}

function toSeverity(category: string | undefined): LanguageServiceSeverity {
	switch (category) {
		case "error":
			return "error";
		case "warning":
			return "warning";
		case "suggestion":
			return "hint";
		default:
			return "info";
	}
}

function resolveBundledTsServerPath(): string {
	return require.resolve("typescript/lib/tsserver.js");
}

function resolveWorkspaceTsServerPath(workspacePath: string): string | null {
	const candidate = path.join(
		workspacePath,
		"node_modules",
		"typescript",
		"lib",
		"tsserver.js",
	);
	return fs.existsSync(candidate) ? candidate : null;
}

function computeEndPosition(content: string): {
	endLine: number;
	endOffset: number;
} {
	const lines = content.split(/\r\n|\r|\n/);
	return {
		endLine: lines.length,
		endOffset: (lines.at(-1)?.length ?? 0) + 1,
	};
}

function normalizeTsTextParts(
	parts: TsServerTextPart[] | string | undefined,
): string {
	if (!parts) {
		return "";
	}

	if (typeof parts === "string") {
		return parts;
	}

	return parts
		.map((part) => (typeof part === "string" ? part : (part.text ?? "")))
		.join("");
}

function normalizeTsHoverContents(
	body: TsServerQuickInfoResponse | undefined,
): LanguageServiceMarkupContent[] {
	if (!body) {
		return [];
	}

	const sections = [
		body.displayString?.trim() ?? "",
		normalizeTsTextParts(body.documentation).trim(),
		...(body.tags ?? [])
			.map((tag) => {
				const tagBody = normalizeTsTextParts(tag.text).trim();
				return tag.name
					? `@${tag.name}${tagBody ? ` ${tagBody}` : ""}`
					: tagBody;
			})
			.filter(Boolean),
	].filter(Boolean);

	if (sections.length === 0) {
		return [];
	}

	return [
		{
			kind: "plaintext",
			value: sections.join("\n\n"),
		},
	];
}

function normalizeTsRange(
	start: { line: number; offset: number } | undefined,
	end: { line: number; offset: number } | undefined,
): LanguageServiceRange | null {
	if (!start || !end) {
		return null;
	}

	return {
		line: start.line,
		column: start.offset,
		endLine: end.line,
		endColumn: end.offset,
	};
}

function normalizeTsFileSpans(body: unknown): TsServerFileSpan[] {
	if (Array.isArray(body)) {
		return body as TsServerFileSpan[];
	}

	if (!body || typeof body !== "object") {
		return [];
	}

	const candidate = body as {
		definitions?: TsServerFileSpan[];
		body?: TsServerFileSpan[];
	};
	return candidate.definitions ?? candidate.body ?? [];
}

export class TypeScriptLanguageProvider implements LanguageServiceProvider {
	readonly id = "typescript";

	readonly label = "TypeScript";

	readonly description =
		"TypeScript, JavaScript, TSX, JSX diagnostics via tsserver.";

	readonly languageIds = [
		"typescript",
		"typescriptreact",
		"javascript",
		"javascriptreact",
	];

	private readonly sessions = new Map<string, WorkspaceSession>();

	supportsLanguage(languageId: string): boolean {
		return [
			"typescript",
			"typescriptreact",
			"javascript",
			"javascriptreact",
		].includes(languageId);
	}

	async openDocument(document: LanguageServiceDocument): Promise<void> {
		const session = await this.ensureSession(
			document.workspaceId,
			document.workspacePath,
		);
		session.openDocuments.set(document.absolutePath, {
			languageId: document.languageId,
			version: document.version,
			content: document.content,
		});
		await this.sendRequest(session, "open", {
			file: document.absolutePath,
			fileContent: document.content,
			projectRootPath: document.workspacePath,
		});
		this.scheduleGetErr(session);
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
		});

		await this.sendRequest(session, "change", {
			file: document.absolutePath,
			line: 1,
			offset: 1,
			...computeEndPosition(previous.content),
			insertString: document.content,
		});
		this.scheduleGetErr(session);
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

		session.openDocuments.delete(args.absolutePath);
		session.diagnosticBuckets.delete(args.absolutePath);
		languageDiagnosticsStore.clearFileDiagnostics(
			args.workspaceId,
			this.fileKey(args.absolutePath),
		);

		try {
			await this.sendRequest(session, "close", {
				file: args.absolutePath,
			});
		} catch (error) {
			console.error("[language-services/typescript] Failed to close document", {
				workspaceId: args.workspaceId,
				absolutePath: args.absolutePath,
				error,
			});
		}

		if (session.openDocuments.size === 0) {
			await this.disposeWorkspace(args);
			return;
		}

		this.scheduleGetErr(session);
	}

	async refreshWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		const session = this.sessions.get(args.workspaceId);
		if (!session || session.openDocuments.size === 0) {
			return;
		}

		this.scheduleGetErr(session, 0);
	}

	getWorkspaceSummary(args: {
		workspaceId: string;
		workspacePath: string;
		enabled: boolean;
	}): LanguageServiceProviderSummary {
		const session = this.sessions.get(args.workspaceId);
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
				status: "idle",
				details: null,
				documentCount: 0,
			};
		}

		return {
			providerId: this.id,
			label: this.label,
			status: session.lastError ? "error" : "ready",
			details: session.lastError,
			documentCount: session.openDocuments.size,
		};
	}

	async disposeWorkspace(args: {
		workspaceId: string;
		workspacePath: string;
	}): Promise<void> {
		const session = this.sessions.get(args.workspaceId);
		if (!session) {
			return;
		}

		if (session.getErrTimer) {
			clearTimeout(session.getErrTimer);
			session.getErrTimer = null;
		}

		for (const request of session.requestResolvers.values()) {
			request.reject(new Error("TypeScript session disposed"));
		}
		session.requestResolvers.clear();

		session.process.removeAllListeners();
		if (!session.process.killed) {
			session.process.kill();
		}

		this.sessions.delete(args.workspaceId);
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
			const response = await this.sendRequest(session, "references", {
				file: args.absolutePath,
				line: args.line,
				offset: args.column,
			});

			const refs = response.body as
				| {
						refs?: Array<{
							file: string;
							start: { line: number; offset: number };
							end: { line: number; offset: number };
						}>;
				  }
				| undefined;

			if (!refs?.refs) return null;

			return refs.refs.map((ref) => ({
				absolutePath: ref.file,
				line: ref.start.line,
				column: ref.start.offset,
				endLine: ref.end.line,
				endColumn: ref.end.offset,
			}));
		} catch {
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
			const response = await this.sendRequest(session, "quickinfo", {
				file: args.absolutePath,
				line: args.line,
				offset: args.column,
			});

			const body = response.body as TsServerQuickInfoResponse | undefined;
			const contents = normalizeTsHoverContents(body);
			if (contents.length === 0) {
				return null;
			}

			session.lastError = null;
			return {
				contents,
				range: normalizeTsRange(body?.start, body?.end),
			};
		} catch {
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
			const response = await this.sendRequest(session, "definition", {
				file: args.absolutePath,
				line: args.line,
				offset: args.column,
			});

			const definitions = normalizeTsFileSpans(response.body);
			if (definitions.length === 0) {
				return null;
			}

			session.lastError = null;
			return definitions.map((definition) => ({
				absolutePath: definition.file,
				line: definition.start.line,
				column: definition.start.offset,
				endLine: definition.end.line,
				endColumn: definition.end.offset,
			}));
		} catch {
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
			const response = await this.sendRequest(session, "prepareCallHierarchy", {
				file: args.absolutePath,
				line: args.line,
				offset: args.column,
			});

			const items = response.body as
				| Array<{
						name: string;
						kind: string;
						file: string;
						span: {
							start: { line: number; offset: number };
							end: { line: number; offset: number };
						};
						selectionSpan: {
							start: { line: number; offset: number };
							end: { line: number; offset: number };
						};
				  }>
				| undefined;

			if (!items) return null;

			return items.map((item) => ({
				name: item.name,
				kind: item.kind,
				absolutePath: item.file,
				line: item.span.start.line,
				column: item.span.start.offset,
				endLine: item.span.end.line,
				endColumn: item.span.end.offset,
				selectionLine: item.selectionSpan.start.line,
				selectionColumn: item.selectionSpan.start.offset,
				selectionEndLine: item.selectionSpan.end.line,
				selectionEndColumn: item.selectionSpan.end.offset,
			}));
		} catch {
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
			const response = await this.sendRequest(
				session,
				"provideCallHierarchyIncomingCalls",
				{
					file: args.item.absolutePath,
					line: args.item.selectionLine,
					offset: args.item.selectionColumn,
				},
			);

			const calls = response.body as
				| Array<{
						from: {
							name: string;
							kind: string;
							file: string;
							span: {
								start: { line: number; offset: number };
								end: { line: number; offset: number };
							};
							selectionSpan: {
								start: { line: number; offset: number };
								end: { line: number; offset: number };
							};
						};
						fromSpans: Array<{
							start: { line: number; offset: number };
							end: { line: number; offset: number };
						}>;
				  }>
				| undefined;

			if (!calls) return null;

			return calls.map((call) => ({
				from: {
					name: call.from.name,
					kind: call.from.kind,
					absolutePath: call.from.file,
					line: call.from.span.start.line,
					column: call.from.span.start.offset,
					endLine: call.from.span.end.line,
					endColumn: call.from.span.end.offset,
					selectionLine: call.from.selectionSpan.start.line,
					selectionColumn: call.from.selectionSpan.start.offset,
					selectionEndLine: call.from.selectionSpan.end.line,
					selectionEndColumn: call.from.selectionSpan.end.offset,
				},
				fromRanges: call.fromSpans.map((span) => ({
					line: span.start.line,
					column: span.start.offset,
					endLine: span.end.line,
					endColumn: span.end.offset,
				})),
			}));
		} catch {
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

		const tsserverPath =
			resolveWorkspaceTsServerPath(workspacePath) ??
			resolveBundledTsServerPath();
		const child = spawn(process.execPath, [tsserverPath, "--stdio"], {
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: "1",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});

		const session: WorkspaceSession = {
			workspaceId,
			workspacePath,
			tsserverPath,
			process: child,
			seq: 0,
			buffer: "",
			requestResolvers: new Map(),
			openDocuments: new Map(),
			diagnosticBuckets: new Map(),
			getErrTimer: null,
			lastError: null,
		};
		let isSessionClosed = false;
		const closeSession = (message: string) => {
			if (isSessionClosed) {
				return;
			}
			isSessionClosed = true;
			session.lastError = message;
			if (session.getErrTimer) {
				clearTimeout(session.getErrTimer);
				session.getErrTimer = null;
			}
			for (const request of session.requestResolvers.values()) {
				request.reject(new Error(message));
			}
			session.requestResolvers.clear();
			this.sessions.delete(workspaceId);
		};

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			this.handleStdout(session, chunk);
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			console.error("[language-services/typescript] tsserver stderr", {
				workspaceId,
				chunk,
			});
		});
		child.on("error", (error) => {
			console.error("[language-services/typescript] tsserver process error", {
				workspaceId,
				error,
			});
			closeSession(
				error instanceof Error
					? `tsserver process error: ${error.message}`
					: "tsserver process error",
			);
		});
		child.on("exit", (code, signal) => {
			closeSession(
				`TypeScript server exited: ${code ?? "null"}${signal ? ` ${signal}` : ""}`,
			);
		});

		this.sessions.set(workspaceId, session);
		await this.sendRequest(session, "configure", {
			preferences: {
				includeCompletionsForModuleExports: true,
				includeCompletionsWithInsertText: true,
			},
		});
		return session;
	}

	private handleStdout(session: WorkspaceSession, chunk: string): void {
		session.buffer += chunk;
		while (true) {
			const framedMessage = tryConsumeContentLengthMessage(session.buffer);
			const lineMessage =
				framedMessage === null ? tryConsumeLineMessage(session.buffer) : null;
			const message = framedMessage ?? lineMessage;
			if (!message) {
				return;
			}

			session.buffer = message.rest;
			const body = message.body.trim();
			if (!body) {
				continue;
			}

			try {
				const message = JSON.parse(body) as TsServerMessage;
				this.handleMessage(session, message);
			} catch (error) {
				console.error(
					"[language-services/typescript] Failed to parse tsserver payload",
					{
						workspaceId: session.workspaceId,
						error,
						body,
					},
				);
			}
		}
	}

	private handleMessage(
		session: WorkspaceSession,
		message: TsServerMessage,
	): void {
		if (message.type === "response") {
			const resolver = session.requestResolvers.get(message.request_seq);
			if (!resolver) {
				return;
			}
			session.requestResolvers.delete(message.request_seq);
			if (message.success) {
				session.lastError = null;
				resolver.resolve(message);
			} else {
				const error = new Error(
					message.message ?? `tsserver command failed: ${message.command}`,
				);
				session.lastError = error.message;
				resolver.reject(error);
			}
			return;
		}

		switch (message.event) {
			case "syntaxDiag":
				this.applyDiagnosticsEvent(session, "syntax", message.body);
				return;
			case "semanticDiag":
				this.applyDiagnosticsEvent(session, "semantic", message.body);
				return;
			case "suggestionDiag":
				this.applyDiagnosticsEvent(session, "suggestion", message.body);
				return;
			case "configFileDiag":
				this.applyConfigDiagnosticsEvent(session, message.body);
				return;
			default:
				return;
		}
	}

	private applyDiagnosticsEvent(
		session: WorkspaceSession,
		bucketKey: DiagnosticBucketKey,
		body: unknown,
	): void {
		const payload = body as
			| { file?: string; diagnostics?: TsServerDiagnostic[] }
			| undefined;
		if (!payload?.file) {
			return;
		}

		const absolutePath = payload.file;
		const buckets =
			session.diagnosticBuckets.get(absolutePath) ?? createEmptyBuckets();
		buckets[bucketKey] = (payload.diagnostics ?? []).map((diagnostic) =>
			this.mapDiagnostic(session.workspacePath, absolutePath, diagnostic),
		);
		session.diagnosticBuckets.set(absolutePath, buckets);
		this.publishDiagnostics(session, absolutePath, buckets);
	}

	private applyConfigDiagnosticsEvent(
		session: WorkspaceSession,
		body: unknown,
	): void {
		const payload = body as
			| {
					triggerFile?: string;
					configFile?: string;
					diagnostics?: TsServerDiagnostic[];
			  }
			| undefined;
		const absolutePath = payload?.configFile ?? payload?.triggerFile;
		if (!absolutePath) {
			return;
		}
		if (!payload) {
			return;
		}

		const buckets =
			session.diagnosticBuckets.get(absolutePath) ?? createEmptyBuckets();
		buckets.config = (payload.diagnostics ?? []).map((diagnostic) =>
			this.mapDiagnostic(session.workspacePath, absolutePath, diagnostic),
		);
		session.diagnosticBuckets.set(absolutePath, buckets);
		this.publishDiagnostics(session, absolutePath, buckets);
	}

	private publishDiagnostics(
		session: WorkspaceSession,
		absolutePath: string,
		buckets: FileDiagnosticBuckets,
	): void {
		const diagnostics = [
			...buckets.syntax,
			...buckets.semantic,
			...buckets.suggestion,
			...buckets.config,
		];
		languageDiagnosticsStore.setFileDiagnostics(
			session.workspaceId,
			this.fileKey(absolutePath),
			diagnostics,
		);
	}

	private mapDiagnostic(
		workspacePath: string,
		absolutePath: string,
		diagnostic: TsServerDiagnostic,
	): LanguageServiceDiagnostic {
		const relatedInformation = diagnostic.relatedInformation
			?.map((item) =>
				this.mapRelatedInformation(workspacePath, absolutePath, item),
			)
			.filter(
				(item): item is LanguageServiceRelatedInformation => item !== null,
			);

		return {
			providerId: this.id,
			source: "typescript",
			absolutePath,
			relativePath: toRelativeWorkspacePath(workspacePath, absolutePath),
			line: diagnostic.start?.line ?? null,
			column: diagnostic.start?.offset ?? null,
			endLine: diagnostic.end?.line ?? null,
			endColumn: diagnostic.end?.offset ?? null,
			message:
				diagnostic.text ?? diagnostic.message ?? "Unknown TypeScript error",
			code: diagnostic.code ?? null,
			severity: toSeverity(diagnostic.category),
			relatedInformation,
		};
	}

	private mapRelatedInformation(
		workspacePath: string,
		fallbackAbsolutePath: string,
		item: NonNullable<TsServerDiagnostic["relatedInformation"]>[number],
	): LanguageServiceRelatedInformation | null {
		const absolutePath = item.span?.file ?? fallbackAbsolutePath;
		const message = item.text ?? item.message ?? "";
		if (!message) {
			return null;
		}

		return {
			absolutePath,
			relativePath: toRelativeWorkspacePath(workspacePath, absolutePath),
			line: item.span?.start?.line ?? null,
			column: item.span?.start?.offset ?? null,
			endLine: item.span?.end?.line ?? null,
			endColumn: item.span?.end?.offset ?? null,
			message,
		};
	}

	private scheduleGetErr(session: WorkspaceSession, delay = 150): void {
		if (session.getErrTimer) {
			clearTimeout(session.getErrTimer);
		}

		session.getErrTimer = setTimeout(() => {
			session.getErrTimer = null;
			if (session.openDocuments.size === 0) {
				return;
			}

			void this.sendRequest(session, "geterr", {
				files: Array.from(session.openDocuments.keys()),
				delay: 0,
			}).catch((error) => {
				session.lastError =
					error instanceof Error ? error.message : String(error);
				console.error("[language-services/typescript] geterr failed", {
					workspaceId: session.workspaceId,
					error,
				});
			});
		}, delay);
	}

	private async sendRequest(
		session: WorkspaceSession,
		command: string,
		args?: unknown,
	): Promise<TsServerResponse> {
		const seq = ++session.seq;
		const payload: TsServerRequest = {
			seq,
			type: "request",
			command,
			arguments: args,
		};
		const content = `${JSON.stringify(payload)}\n`;

		return await new Promise<TsServerResponse>((resolve, reject) => {
			session.requestResolvers.set(seq, { resolve, reject });
			session.process.stdin.write(content, "utf8", (error) => {
				if (!error) {
					return;
				}

				session.requestResolvers.delete(seq);
				reject(error);
			});
		});
	}

	private fileKey(absolutePath: string): string {
		return `${this.id}::${absolutePath}`;
	}
}
