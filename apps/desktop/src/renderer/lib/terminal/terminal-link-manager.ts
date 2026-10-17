/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type { ILinkHandler, Terminal as XTerm } from "@xterm/xterm";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
	WordLinkDetector,
} from "./links";
import { UrlLinkProvider } from "./links/url-link-provider";

export type LinkHoverInfo =
	| {
			kind: "file";
			isDirectory: boolean;
			resolvedPath?: string;
			row?: number;
			col?: number;
	  }
	| { kind: "url"; url: string };

/**
 * Link handler callbacks for the v2 terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (event: MouseEvent, url: string) => void;
	/** Called when the mouse enters a detected link (file path or URL). */
	onLinkHover?: (event: MouseEvent, info: LinkHoverInfo) => void;
	/** Called when the mouse leaves a previously hovered link. */
	onLinkLeave?: () => void;
	/**
	 * Whether a click with this event's modifiers opens the link. Used to keep
	 * xterm's Shift+click "extend selection" from also firing on a click that
	 * opens a link (e.g. Cmd+Shift+click → open in system browser).
	 */
	isLinkActivation?: (event: MouseEvent, info: LinkHoverInfo) => boolean;
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
 * 2. UrlLinkProvider (wrapped URL detection)
 * 3. WordLinkDetector (bare filenames like "AGENTS.md")
 */
export class TerminalLinkManager {
	private _disposables: LinkProviderDisposable[] = [];
	private _resolver: TerminalLinkResolver | null = null;
	private _handlers: TerminalLinkHandlers | null = null;
	private _oscLinkHandler: ILinkHandler | null = null;
	private _hoveredLink: LinkHoverInfo | null = null;
	private _screenElement: HTMLElement | null = null;

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
		this._clearOscLinkHandler();
		this._screenElement?.removeEventListener(
			"mousedown",
			this._handleScreenMouseDown,
		);
		this._screenElement = null;
		this._hoveredLink = null;
		this._resolver?.clearCache();
		this._resolver = null;
		this._handlers = null;
	}

	/**
	 * xterm's SelectionService listens for mousedown on the outer `.xterm`
	 * element and turns any Shift+mousedown into "extend selection", even when
	 * the click lands on a link. The Linkifier listens on the inner
	 * `.xterm-screen`, so stopping propagation there keeps link activation
	 * working while the selection is left alone. preventDefault + focus stand
	 * in for what xterm's own mousedown handling would have done.
	 */
	private _handleScreenMouseDown = (event: MouseEvent): void => {
		if (event.button !== 0 || !event.shiftKey) return;
		const link = this._hoveredLink;
		if (!link || !this._handlers?.isLinkActivation?.(event, link)) return;
		event.stopPropagation();
		event.preventDefault();
		this._terminal.focus();
	};

	private _listenForLinkMouseDown(): void {
		if (this._screenElement) return;
		const screenElement =
			this._terminal.element?.querySelector<HTMLElement>(".xterm-screen");
		if (!screenElement) return;
		screenElement.addEventListener("mousedown", this._handleScreenMouseDown);
		this._screenElement = screenElement;
	}

	private _trackHover(event: MouseEvent, info: LinkHoverInfo): void {
		this._hoveredLink = info;
		this._handlers?.onLinkHover?.(event, info);
	}

	private _trackLeave(): void {
		this._hoveredLink = null;
		this._handlers?.onLinkLeave?.();
	}

	private _clearOscLinkHandler(): void {
		if (this._terminal.options.linkHandler === this._oscLinkHandler) {
			this._terminal.options.linkHandler = null;
		}
		this._oscLinkHandler = null;
	}

	private _register(): void {
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();

		this._hoveredLink = null;
		this._listenForLinkMouseDown();

		// Reuse resolver to preserve stat cache across re-registrations.
		if (!this._resolver) {
			this._resolver = new TerminalLinkResolver(handlers.stat);
		}

		const onLinkHover = (event: MouseEvent, info: LinkHoverInfo) =>
			this._trackHover(event, info);
		const onLinkLeave = () => this._trackLeave();

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			handlers.onFileLinkClick,
			(event, link) =>
				onLinkHover(event, {
					kind: "file",
					isDirectory: link.isDirectory,
					resolvedPath: link.resolvedPath,
					row: link.row,
					col: link.col,
				}),
			onLinkLeave,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));

		// 2. URL link provider (handles terminal-wrapped URLs)
		if (handlers.onUrlClick) {
			const onUrlClick = handlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(
				this._terminal,
				(event, uri) => {
					onUrlClick(event, uri);
				},
				(event, uri) => onLinkHover(event, { kind: "url", url: uri }),
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(urlProvider));

			// xterm always registers its own OSC 8 hyperlink provider first. Without
			// this, OSC 8 links use xterm's default confirm() + window.open() path,
			// which is blocked in Electron and also bypasses our link preferences.
			this._oscLinkHandler = {
				allowNonHttpProtocols: false,
				activate: (event, uri) => {
					onUrlClick(event, uri);
				},
				hover: (event, uri) => onLinkHover(event, { kind: "url", url: uri }),
				leave: () => onLinkLeave(),
			};
			this._terminal.options.linkHandler = this._oscLinkHandler;
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
				(event, resolvedPath) =>
					onLinkHover(event, {
						kind: "file",
						isDirectory: false,
						resolvedPath,
					}),
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(wordDetector));
		}
	}
}
