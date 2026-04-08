/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as XTerm } from "@xterm/xterm";
import { UrlLinkProvider } from "../../screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/link-providers";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
	WordLinkDetector,
} from "./links";

/**
 * Link handler callbacks for the v2 terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (url: string) => void;
	/**
	 * Stat callback to validate file paths exist. Called via the host service
	 * which handles all path resolution (relative, tilde, etc.) server-side.
	 */
	stat?: StatCallback;
}

interface LinkProviderDisposable {
	dispose(): void;
}

/**
 * Manages all link providers for a single terminal instance.
 *
 * Providers are registered in priority order (xterm uses first match):
 * 1. LocalLinkDetector (file paths with validation) + styled-text fallback
 * 2. UrlLinkProvider (hard-wrapped URL detection)
 * 3. WordLinkDetector (bare filenames like "AGENTS.md")
 */
export class TerminalLinkManager {
	private _disposables: LinkProviderDisposable[] = [];
	private _resolver: TerminalLinkResolver | null = null;
	private _handlers: TerminalLinkHandlers | null = null;

	constructor(private readonly _terminal: XTerm) {}

	/**
	 * Set link handlers and register providers. Safe to call multiple times —
	 * old providers are disposed before new ones are registered. The resolver
	 * is reused to preserve the stat cache.
	 */
	setHandlers(handlers: TerminalLinkHandlers): void {
		this._handlers = handlers;
		this._register();
	}

	/**
	 * Re-register providers (e.g. after terminal is created).
	 * No-op if handlers haven't been set yet.
	 */
	ensureRegistered(): void {
		if (this._handlers) {
			this._register();
		}
	}

	dispose(): void {
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._resolver?.clearCache();
		this._resolver = null;
		this._handlers = null;
	}

	private _register(): void {
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];

		// Reuse resolver to preserve stat cache across re-registrations.
		if (!this._resolver) {
			this._resolver = new TerminalLinkResolver(handlers.stat);
		}

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			handlers.onFileLinkClick,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));

		// 2. URL link provider (handles hard-wrapped URLs)
		if (handlers.onUrlClick) {
			const onUrlClick = handlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(this._terminal, (_event, uri) => {
				onUrlClick(uri);
			});
			this._disposables.push(this._terminal.registerLinkProvider(urlProvider));
		}

		// 3. SUPERSET ADDITION: Word link detector (lowest priority).
		// Adapted from VSCode's TerminalWordLinkDetector. VSCode opens a
		// workspace search on click; ours opens the file directly if it
		// exists (validated via stat). Catches bare filenames like
		// "AGENTS.md" that have no path separator or line suffix.
		// To disable: remove or comment out this block.
		if (handlers.onFileLinkClick) {
			const onFileClick = handlers.onFileLinkClick;
			const wordDetector = new WordLinkDetector(
				this._terminal,
				this._resolver,
				(event, resolvedPath) => {
					onFileClick(event, {
						text: resolvedPath,
						startIndex: 0,
						endIndex: 0,
						resolvedPath,
						isDirectory: false,
						row: undefined,
						col: undefined,
						rowEnd: undefined,
						colEnd: undefined,
					});
				},
			);
			this._disposables.push(this._terminal.registerLinkProvider(wordDetector));
		}
	}
}
