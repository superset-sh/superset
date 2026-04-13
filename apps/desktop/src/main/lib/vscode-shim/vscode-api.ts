/**
 * Factory that creates a `vscode` module-like namespace object.
 * Extensions receive this when they `require('vscode')`.
 *
 * Unimplemented API accesses are logged via Proxy so we can
 * discover which APIs extensions actually use at runtime.
 */

import { commands } from "./api/commands";
import { shimWarn } from "./api/debug-log";
import {
	CancellationTokenSource,
	Disposable,
	EventEmitter,
} from "./api/event-emitter";
import { Uri } from "./api/uri";
import { window } from "./api/window";
import { workspace } from "./api/workspace";

// VS Code enums
const StatusBarAlignment = { Left: 1, Right: 2 } as const;
const ViewColumn = {
	Active: -1,
	Beside: -2,
	One: 1,
	Two: 2,
	Three: 3,
	Four: 4,
} as const;
const ProgressLocation = {
	SourceControl: 1,
	Window: 10,
	Notification: 15,
} as const;
const ConfigurationTarget = {
	Global: 1,
	Workspace: 2,
	WorkspaceFolder: 3,
} as const;
const DiagnosticSeverity = {
	Error: 0,
	Warning: 1,
	Information: 2,
	Hint: 3,
} as const;
const FileType = {
	Unknown: 0,
	File: 1,
	Directory: 2,
	SymbolicLink: 64,
} as const;
const EndOfLine = { LF: 1, CRLF: 2 } as const;
const OverviewRulerLane = { Left: 1, Center: 2, Right: 4, Full: 7 } as const;
const ExtensionMode = { Production: 1, Development: 2, Test: 3 } as const;
const TreeItemCollapsibleState = {
	None: 0,
	Collapsed: 1,
	Expanded: 2,
} as const;
const TextEditorRevealType = {
	Default: 0,
	InCenter: 1,
	InCenterIfOutsideViewport: 2,
	AtTop: 3,
} as const;
const EnvironmentVariableMutatorType = {
	Replace: 1,
	Append: 2,
	Prepend: 3,
} as const;
const UIKind = { Desktop: 1, Web: 2 } as const;
const LogLevel = {
	Off: 0,
	Trace: 1,
	Debug: 2,
	Info: 3,
	Warning: 4,
	Error: 5,
} as const;
const ExtensionKind = { UI: 1, Workspace: 2 } as const;
const ColorThemeKind = {
	Light: 1,
	Dark: 2,
	HighContrast: 3,
	HighContrastLight: 4,
} as const;
const SymbolKind = {
	File: 0,
	Module: 1,
	Namespace: 2,
	Package: 3,
	Class: 4,
	Method: 5,
	Property: 6,
	Field: 7,
	Constructor: 8,
	Enum: 9,
	Interface: 10,
	Function: 11,
	Variable: 12,
	Constant: 13,
	String: 14,
	Number: 15,
	Boolean: 16,
	Array: 17,
	Object: 18,
	Key: 19,
	Null: 20,
	EnumMember: 21,
	Struct: 22,
	Event: 23,
	Operator: 24,
	TypeParameter: 25,
} as const;
const CompletionItemKind = {
	Text: 0,
	Method: 1,
	Function: 2,
	Constructor: 3,
	Field: 4,
	Variable: 5,
	Class: 6,
	Interface: 7,
	Module: 8,
	Property: 9,
	Unit: 10,
	Value: 11,
	Enum: 12,
	Keyword: 13,
	Snippet: 14,
	Color: 15,
	File: 16,
	Reference: 17,
	Folder: 18,
	EnumMember: 19,
	Constant: 20,
	Struct: 21,
	Event: 22,
	Operator: 23,
	TypeParameter: 24,
} as const;
const TextDocumentChangeReason = { Undo: 1, Redo: 2 } as const;

// Stub classes
class Position {
	readonly line: number;
	readonly character: number;
	constructor(line: number, character: number) {
		this.line = line;
		this.character = character;
	}
	isEqual(other: Position): boolean {
		return this.line === other.line && this.character === other.character;
	}
	isBefore(other: Position): boolean {
		return (
			this.line < other.line ||
			(this.line === other.line && this.character < other.character)
		);
	}
	isAfter(other: Position): boolean {
		return !this.isEqual(other) && !this.isBefore(other);
	}
	translate(lineDelta?: number, characterDelta?: number): Position {
		return new Position(
			this.line + (lineDelta ?? 0),
			this.character + (characterDelta ?? 0),
		);
	}
	with(line?: number, character?: number): Position {
		return new Position(line ?? this.line, character ?? this.character);
	}
	compareTo(other: Position): number {
		return this.line - other.line || this.character - other.character;
	}
}

class Range {
	readonly start: Position;
	readonly end: Position;
	constructor(
		startLine: number | Position,
		startChar: number | Position,
		endLine?: number,
		endChar?: number,
	) {
		if (typeof startLine === "number") {
			if (typeof endLine !== "number" || typeof endChar !== "number") {
				throw new TypeError("Range requires endLine and endChar");
			}
			this.start = new Position(startLine, startChar as number);
			this.end = new Position(endLine, endChar);
		} else {
			this.start = startLine;
			this.end = startChar as Position;
		}
	}
	get isEmpty(): boolean {
		return this.start.isEqual(this.end);
	}
	contains(_positionOrRange: Position | Range): boolean {
		return true;
	}
	with(start?: Position, end?: Position): Range {
		return new Range(start ?? this.start, end ?? this.end);
	}
}

class Selection extends Range {
	readonly anchor: Position;
	readonly active: Position;
	constructor(
		anchorLine: number | Position,
		anchorChar: number | Position,
		activeLine?: number,
		activeChar?: number,
	) {
		if (typeof anchorLine === "number") {
			if (typeof activeLine !== "number" || typeof activeChar !== "number") {
				throw new TypeError("Selection requires activeLine and activeChar");
			}
			super(anchorLine, anchorChar as number, activeLine, activeChar);
			this.anchor = new Position(anchorLine, anchorChar as number);
			this.active = new Position(activeLine, activeChar);
		} else {
			super(anchorLine, anchorChar as Position);
			this.anchor = anchorLine;
			this.active = anchorChar as Position;
		}
	}
	get isReversed(): boolean {
		return this.anchor.isAfter(this.active);
	}
}

class ThemeColor {
	readonly id: string;
	constructor(id: string) {
		this.id = id;
	}
}

class ThemeIcon {
	static readonly File = new ThemeIcon("file");
	static readonly Folder = new ThemeIcon("folder");
	readonly id: string;
	readonly color?: ThemeColor;
	constructor(id: string, color?: ThemeColor) {
		this.id = id;
		this.color = color;
	}
}

class MarkdownString {
	value: string;
	isTrusted?: boolean;
	supportThemeIcons?: boolean;
	supportHtml?: boolean;
	constructor(value?: string, supportThemeIcons?: boolean) {
		this.value = value ?? "";
		this.supportThemeIcons = supportThemeIcons;
	}
	appendText(value: string): MarkdownString {
		this.value += value;
		return this;
	}
	appendMarkdown(value: string): MarkdownString {
		this.value += value;
		return this;
	}
	appendCodeblock(code: string, language?: string): MarkdownString {
		this.value += `\n\`\`\`${language ?? ""}\n${code}\n\`\`\`\n`;
		return this;
	}
}

class WorkspaceEdit {
	private _edits: Array<{
		uri: Uri;
		edits: Array<{ range: Range; newText: string }>;
	}> = [];
	replace(uri: Uri, range: Range, newText: string): void {
		this._edits.push({ uri, edits: [{ range, newText }] });
	}
	insert(uri: Uri, position: Position, newText: string): void {
		this.replace(uri, new Range(position, position), newText);
	}
	delete(uri: Uri, range: Range): void {
		this.replace(uri, range, "");
	}
	/** Set all edits for a given URI (replaces existing edits for that URI) */
	set(
		uri: Uri,
		edits: Array<{ range: Range; newText: string } | unknown>,
	): void {
		const textEdits = (edits as Array<{ range?: Range; newText?: string }>)
			.filter((e) => e && "range" in e && "newText" in e)
			.map((e) => ({ range: e.range as Range, newText: e.newText as string }));
		const existing = this._edits.find(
			(e) => e.uri.toString() === uri.toString(),
		);
		if (existing) {
			existing.edits = textEdits;
		} else if (textEdits.length > 0) {
			this._edits.push({ uri, edits: textEdits });
		}
	}
	entries(): Array<[Uri, Array<{ range: Range; newText: string }>]> {
		return this._edits.map((e) => [e.uri, e.edits]);
	}
}

class CodeLens {
	readonly range: Range;
	command?: { title: string; command: string; arguments?: unknown[] };
	constructor(
		range: Range,
		command?: { title: string; command: string; arguments?: unknown[] },
	) {
		this.range = range;
		this.command = command;
	}
	get isResolved(): boolean {
		return !!this.command;
	}
}

class TabInputText {
	readonly uri: Uri;
	constructor(uri: Uri) {
		this.uri = uri;
	}
}

class NotebookCellOutputItem {
	readonly mime: string;
	readonly data: Uint8Array;
	constructor(data: Uint8Array, mime: string) {
		this.data = data;
		this.mime = mime;
	}
	static text(value: string, mime?: string): NotebookCellOutputItem {
		return new NotebookCellOutputItem(
			new TextEncoder().encode(value),
			mime ?? "text/plain",
		);
	}
	static json(value: unknown, mime?: string): NotebookCellOutputItem {
		return new NotebookCellOutputItem(
			new TextEncoder().encode(JSON.stringify(value)),
			mime ?? "application/json",
		);
	}
	static stdout(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(
			value,
			"application/vnd.code.notebook.stdout",
		);
	}
	static stderr(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(
			value,
			"application/vnd.code.notebook.stderr",
		);
	}
	static error(err: Error): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(
			JSON.stringify({
				name: err.name,
				message: err.message,
				stack: err.stack,
			}),
			"application/vnd.code.notebook.error",
		);
	}
}

class NotebookCellOutput {
	readonly items: NotebookCellOutputItem[];
	readonly metadata?: Record<string, unknown>;
	constructor(
		items: NotebookCellOutputItem[],
		metadata?: Record<string, unknown>,
	) {
		this.items = items;
		this.metadata = metadata;
	}
}

const NotebookCellKind = {
	Markup: 1,
	Code: 2,
} as const;

const NotebookEdit = {
	replaceCells(_range: unknown, _cells: unknown[]) {
		return {};
	},
	insertCells(_index: number, _cells: unknown[]) {
		return {};
	},
	deleteCells(_range: unknown) {
		return {};
	},
	updateCellMetadata(_index: number, _metadata: Record<string, unknown>) {
		return {};
	},
} as const;

class TabInputTextDiff {
	readonly original: Uri;
	readonly modified: Uri;
	constructor(original: Uri, modified: Uri) {
		this.original = original;
		this.modified = modified;
	}
}

// Languages namespace (stub)
const languages = {
	getDiagnostics(_resource?: unknown): unknown[] {
		// Without args: return iterable of [Uri, Diagnostic[]] pairs
		// With uri arg: return Diagnostic[]
		return [];
	},
	onDidChangeDiagnostics: new EventEmitter<unknown>().event,
	createDiagnosticCollection(_name?: string) {
		const items = new Map<string, unknown[]>();
		return {
			name: _name ?? "",
			set(uri: Uri, diagnostics: unknown[]) {
				items.set(uri.toString(), diagnostics);
			},
			delete(uri: Uri) {
				items.delete(uri.toString());
			},
			clear() {
				items.clear();
			},
			dispose() {
				items.clear();
			},
		};
	},
	registerCodeLensProvider(_selector: unknown, _provider: unknown): Disposable {
		return new Disposable(() => {});
	},
	registerHoverProvider(_selector: unknown, _provider: unknown): Disposable {
		return new Disposable(() => {});
	},
	registerDefinitionProvider(
		_selector: unknown,
		_provider: unknown,
	): Disposable {
		return new Disposable(() => {});
	},
	registerReferenceProvider(
		_selector: unknown,
		_provider: unknown,
	): Disposable {
		return new Disposable(() => {});
	},
	registerDocumentSymbolProvider(
		_selector: unknown,
		_provider: unknown,
	): Disposable {
		return new Disposable(() => {});
	},
	registerCompletionItemProvider(
		_selector: unknown,
		_provider: unknown,
		..._triggerCharacters: string[]
	): Disposable {
		return new Disposable(() => {});
	},
};

// Extensions namespace
const extensions = {
	getExtension(extensionId: string): unknown {
		try {
			const { getLoadedExtension } =
				require("./loader") as typeof import("./loader");
			const loaded = getLoadedExtension(extensionId);
			if (loaded) {
				return {
					id: loaded.info.id,
					extensionPath: loaded.info.extensionPath,
					extensionUri: Uri.file(loaded.info.extensionPath),
					isActive: loaded.info.isActive,
					packageJSON: loaded.info.manifest,
					exports: loaded.exports,
				};
			}
		} catch {}
		return undefined;
	},
	all: [] as unknown[],
	onDidChange: new EventEmitter<void>().event,
};

// Env namespace
const env = {
	appName: "Visual Studio Code",
	appRoot: process.cwd(),
	appHost: "superset-desktop",
	language: "en",
	clipboard: {
		async readText(): Promise<string> {
			try {
				const { clipboard } = require("electron");
				return clipboard.readText();
			} catch {
				return "";
			}
		},
		async writeText(text: string): Promise<void> {
			try {
				const { clipboard } = require("electron");
				clipboard.writeText(text);
			} catch {}
		},
	},
	machineId: "superset-desktop",
	sessionId: `session-${Date.now()}`,
	uriScheme: "vscode",
	shell: process.env.SHELL ?? "/bin/zsh",
	get uiKind() {
		return UIKind.Desktop;
	},
	get logLevel() {
		return LogLevel.Info;
	},
	onDidChangeLogLevel: new EventEmitter<number>().event,
	remoteName: undefined as string | undefined,
	isNewAppInstall: false,
	isTelemetryEnabled: false,
	onDidChangeTelemetryEnabled: new EventEmitter<boolean>().event,
	createTelemetryLogger(_sender: unknown, _options?: unknown) {
		return {
			logUsage() {},
			logError() {},
			dispose() {},
			onDidChangeEnableStates: new EventEmitter<unknown>().event,
		};
	},
	async openExternal(_target: Uri): Promise<boolean> {
		try {
			const { shell } = require("electron");
			shell.openExternal(_target.toString());
		} catch {}
		return true;
	},
	async asExternalUri(uri: Uri): Promise<Uri> {
		return uri;
	},
};

// Authentication namespace
const authentication = {
	getSession(
		_providerId: string,
		_scopes: string[],
		_options?: unknown,
	): Promise<unknown> {
		return Promise.resolve(undefined);
	},
	registerAuthenticationProvider(
		_id: string,
		_label: string,
		_provider: unknown,
		_options?: unknown,
	): Disposable {
		return new Disposable(() => {});
	},
	onDidChangeSessions: new EventEmitter<unknown>().event,
};

// l10n namespace
const l10n = {
	t(message: string, ..._args: unknown[]): string {
		return message;
	},
	bundle: undefined as unknown,
	uri: undefined as unknown,
};

// Build the vscode namespace
export function createVscodeApi(): Record<string, unknown> {
	const api: Record<string, unknown> = {
		// Module interop flags
		__esModule: true,

		// VS Code version (extensions check this for feature availability)
		version: "1.96.0",

		// Namespaces
		commands,
		workspace,
		window,
		languages,
		extensions,
		env,
		authentication,
		l10n,

		// Proposed API: chat sessions
		chat: {
			_providers: new Map<string, unknown>(),
			registerChatSessionItemProvider(id: string, provider: unknown) {
				(this as { _providers: Map<string, unknown> })._providers.set(
					id,
					provider,
				);
				return new Disposable(() => {
					(this as { _providers: Map<string, unknown> })._providers.delete(id);
				});
			},
			getSessionProvider(id: string): unknown {
				return (this as { _providers: Map<string, unknown> })._providers.get(
					id,
				);
			},
		},

		// Proposed API: language model
		lm: {
			_models: [] as Array<{
				id: string;
				vendor: string;
				family: string;
				version: string;
			}>,
			onDidChangeChatModels: new EventEmitter<void>().event,
			async selectChatModels(_selector?: {
				vendor?: string;
				family?: string;
				id?: string;
			}): Promise<unknown[]> {
				return [];
			},
			async sendChatRequest(
				_model: unknown,
				_messages: unknown[],
				_options?: unknown,
			): Promise<unknown> {
				throw new Error("Language model API not available in Superset Desktop");
			},
			getModelProxy: undefined as unknown,
			isModelProxyAvailable: false,
		},

		// Classes
		Uri,
		Position,
		Range,
		Selection,
		Disposable,
		EventEmitter,
		CancellationTokenSource,
		ThemeColor,
		ThemeIcon,
		MarkdownString,
		WorkspaceEdit,
		TabInputText,
		TabInputTextDiff,
		NotebookCellOutputItem,
		NotebookCellOutput,
		NotebookCellKind,
		NotebookEdit,
		CodeLens,

		// Enums
		StatusBarAlignment,
		ViewColumn,
		ProgressLocation,
		ConfigurationTarget,
		DiagnosticSeverity,
		FileType,
		EndOfLine,
		OverviewRulerLane,
		ExtensionMode,
		TreeItemCollapsibleState,
		TextEditorRevealType,
		EnvironmentVariableMutatorType,
		UIKind,
		LogLevel,
		ExtensionKind,
		ColorThemeKind,
		SymbolKind,
		CompletionItemKind,
		TextDocumentChangeReason,
	};

	// Proxy logger: log access to unimplemented APIs
	return new Proxy(api, {
		get(target, prop, receiver) {
			if (typeof prop === "string" && !(prop in target)) {
				shimWarn(`[vscode-shim] Unimplemented API accessed: vscode.${prop}`);
				return undefined;
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}
