import { EventEmitter } from "node:events";
import { createServer as createNetServer } from "node:net";
import type { BrowserWindow, WebContentsView } from "electron";
import { getProcessEnvWithShellPath } from "../../../lib/trpc/routers/workspaces/utils/shell-env";
import { isCodeCliAvailable as defaultIsCodeCliAvailable } from "./check-code-cli";
import { findFreePort as defaultFindFreePort } from "./find-free-port";
import { reclaimOrphanServer } from "./reclaim-orphan-server";
import { VscodeServer } from "./vscode-server";

async function createDefaultView(
	browserSessionDir: string,
): Promise<WebContentsView> {
	const electron = await import("electron");
	// Persistent session backed by an absolute path that doesn't vary by
	// workspace. `session.fromPartition("persist:vscode")` would inherit
	// `app.getPath("userData")`, which dev builds override per-workspace via
	// `app.setName("Superset (<workspace>)")` — isolating IndexedDB/localStorage
	// across worktrees. A stable disk path keeps user-level VS Code settings,
	// themes, and UI prefs shared across every pane and every workspace.
	const vscodeSession = electron.session.fromPath(browserSessionDir);
	return new electron.WebContentsView({
		webPreferences: {
			backgroundThrottling: false,
			session: vscodeSession,
			nodeIntegration: false,
			sandbox: true,
			contextIsolation: true,
		},
	});
}

export type VscodeStartStatus = "ready" | "cli-missing" | "failed";

export interface VscodeStartResult {
	status: VscodeStartStatus;
	port?: number;
	error?: string;
}

export interface VscodeBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface VscodeStatusEvent {
	paneId: string;
	status: "starting" | "ready" | "exited" | "error";
	error?: string;
}

export interface VscodeFocusEvent {
	paneId: string;
	focused: boolean;
}

export interface VscodeManagerDeps {
	getWindow: () => BrowserWindow | null;
	/** Stable on-disk location for `code serve-web` state shared across panes. */
	serverDataDir?: string;
	/**
	 * Absolute path where the embedded VS Code `WebContentsView` persists
	 * browser-side state (IndexedDB, localStorage, service worker cache).
	 * Must NOT be derived from `app.getPath("userData")` because dev builds
	 * override the app name per-workspace, making userData workspace-scoped —
	 * which would isolate user settings and themes across worktrees.
	 */
	browserSessionDir?: string;
	findFreePort?: () => Promise<number>;
	isCodeCliAvailable?: () => Promise<boolean>;
	createServer?: (port: number) => VscodeServer;
	createView?: () => WebContentsView;
	/**
	 * Preferred port for the shared `code serve-web` process. When free the
	 * server binds here on every launch so the browser-side origin (and thus
	 * IndexedDB/localStorage buckets for VS Code UI state) remain stable
	 * across app restarts. Falls back to an ephemeral port if taken.
	 */
	preferredPort?: number;
	/**
	 * Optional on-disk path where the shared server records its child PID.
	 * On startup, `ensureShared()` reclaims an orphan matching this PID
	 * (from dev hot-reload or Electron crash) so the pinned port stays
	 * bindable — which keeps the browser origin (and VS Code IDB/localStorage
	 * state) stable across app restarts.
	 */
	pidFilePath?: string;
}

interface Entry {
	view: WebContentsView;
	worktreePath: string;
}

interface SharedServer {
	server: VscodeServer;
	port: number;
	/** Resolves to the base URL once the child is ready; rejects on early exit. */
	readyUrl: Promise<string>;
}

/**
 * Default port the shared `code serve-web` process binds to when it's free.
 * Pinned so the browser origin (and thus VS Code UI IndexedDB/localStorage
 * buckets) survive app restarts. Falls back to an ephemeral port otherwise.
 */
export const DEFAULT_PREFERRED_VSCODE_PORT = 51851;

function appendFolderParam(url: string, folder: string): string {
	try {
		const parsed = new URL(url);
		parsed.searchParams.set("folder", folder);
		return parsed.toString();
	} catch {
		return url;
	}
}

async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = createNetServer();
		probe.once("error", () => resolve(false));
		probe.listen(port, "127.0.0.1", () => {
			probe.close(() => resolve(true));
		});
	});
}

/**
 * Poll `isPortAvailable(port)` until it returns true or the deadline passes.
 * Used after reclaiming an orphan: SIGKILL is synchronous but the kernel
 * needs a moment to tear down the listening socket before we can bind again.
 */
async function waitForPortAvailable(
	port: number,
	timeoutMs: number,
	intervalMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isPortAvailable(port)) return true;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return isPortAvailable(port);
}

/**
 * One coordinator for the whole app. All VS Code panes share a single
 * `code serve-web` process so every pane's WebContentsView loads from the
 * same `http://127.0.0.1:<port>` origin — which is what keeps IndexedDB and
 * localStorage bucket-consistent across panes (and, with port pinning,
 * across app restarts). Per-pane state comes from the `?folder=` query.
 *
 * Not exported as a singleton — `main/windows/main.ts` instantiates it with
 * `getWindow`.
 */
export class VscodeManager extends EventEmitter {
	private readonly entries = new Map<string, Entry>();
	private readonly pending = new Map<string, Promise<VscodeStartResult>>();
	// Monotonic counter per pane. start() captures the current value; stop()
	// bumps it so any in-flight doStart() can detect that its pane was closed
	// before it reaches `addChildView`/`loadURL` and bail out cleanly.
	private readonly startGen = new Map<string, number>();
	private shared: SharedServer | null = null;
	private sharedPending: Promise<
		SharedServer | { error: VscodeStartResult }
	> | null = null;

	constructor(private readonly deps: VscodeManagerDeps) {
		super();
	}

	async start(args: {
		paneId: string;
		worktreePath: string;
	}): Promise<VscodeStartResult> {
		const { paneId, worktreePath } = args;
		const existing = this.entries.get(paneId);
		if (existing && this.shared) {
			return { status: "ready", port: this.shared.port };
		}
		if (existing) {
			// Shared server exited (exit handler cleared `this.shared`) but the
			// entry survived. Returning "ready" here would hand back a dead
			// WebContentsView; drop it and fall through to a fresh doStart().
			this.cleanupView(paneId);
		}
		const inflight = this.pending.get(paneId);
		if (inflight) return inflight;

		const gen = (this.startGen.get(paneId) ?? 0) + 1;
		this.startGen.set(paneId, gen);
		const promise = this.doStart(paneId, worktreePath, gen);
		this.pending.set(paneId, promise);
		try {
			return await promise;
		} finally {
			this.pending.delete(paneId);
		}
	}

	private isCancelled(paneId: string, gen: number): boolean {
		return this.startGen.get(paneId) !== gen;
	}

	private async doStart(
		paneId: string,
		worktreePath: string,
		gen: number,
	): Promise<VscodeStartResult> {
		// One retry is enough to cover the "stale shared" race: the exit
		// handler clears `this.shared`, but a doStart() already mid-flight
		// still holds a reference to the dead SharedServer and would surface
		// a "child exited before ready" error even though ensureShared() on
		// the next tick could spawn a healthy replacement. Two attempts
		// bounds the recovery so a genuinely broken `code` binary can't spin
		// forever.
		const MAX_ATTEMPTS = 2;
		let lastError: unknown;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			let sharedOrError: SharedServer | { error: VscodeStartResult };
			try {
				sharedOrError = await this.ensureShared();
			} catch (err) {
				// ensureShared() can reject from isCodeCliAvailable, orphan
				// reclaim, port probing, env resolution, or server construction.
				// Convert into the declared VscodeStartResult shape instead of
				// letting the rejection surface from start().
				const error = err instanceof Error ? err.message : String(err);
				this.emitStatus({ paneId, status: "error", error });
				return { status: "failed", error };
			}
			if ("error" in sharedOrError) return sharedOrError.error;
			const shared = sharedOrError;
			if (this.isCancelled(paneId, gen)) {
				return { status: "failed", error: "cancelled" };
			}

			const window = this.deps.getWindow();
			if (!window || window.isDestroyed()) {
				return { status: "failed", error: "no-window" };
			}

			const view =
				this.deps.createView?.() ??
				(await createDefaultView(this.requireBrowserSessionDir()));
			if (this.isCancelled(paneId, gen)) {
				try {
					view.webContents.close();
				} catch {
					// webContents may already be destroyed
				}
				return { status: "failed", error: "cancelled" };
			}
			view.setVisible(false);
			view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

			const expectedOrigin = `http://127.0.0.1:${shared.port}`;
			view.webContents.on("will-navigate", (event, url) => {
				try {
					const parsed = new URL(url);
					if (parsed.origin !== expectedOrigin) {
						event.preventDefault();
					}
				} catch {
					event.preventDefault();
				}
			});
			view.webContents.setWindowOpenHandler(({ url }) => {
				try {
					const parsed = new URL(url);
					if (parsed.origin !== expectedOrigin) {
						return { action: "deny" } as const;
					}
				} catch {
					return { action: "deny" } as const;
				}
				return { action: "deny" } as const;
			});

			window.contentView.addChildView(view);

			view.webContents.on("focus", () => {
				this.emitFocus({ paneId, focused: true });
			});
			view.webContents.on("blur", () => {
				this.emitFocus({ paneId, focused: false });
			});

			this.entries.set(paneId, { view, worktreePath });
			this.emitStatus({ paneId, status: "starting" });

			let baseUrl: string;
			try {
				baseUrl = await shared.readyUrl;
			} catch (err) {
				lastError = err;
				this.cleanupView(paneId);
				if (attempt < MAX_ATTEMPTS && this.shared !== shared) {
					// The exit handler already reaped `this.shared`; our captured
					// reference is dead. Retry so ensureShared() can spin up a
					// fresh server on the same (or fallback) port.
					continue;
				}
				this.emitStatus({
					paneId,
					status: "error",
					error: err instanceof Error ? err.message : String(err),
				});
				return {
					status: "failed",
					error: err instanceof Error ? err.message : String(err),
				};
			}
			if (this.isCancelled(paneId, gen)) {
				this.cleanupView(paneId);
				return { status: "failed", error: "cancelled" };
			}
			const urlWithFolder = appendFolderParam(baseUrl, worktreePath);
			try {
				await view.webContents.loadURL(urlWithFolder);
			} catch (err) {
				// loadURL rejects on did-fail-load. Without awaiting we'd emit
				// "ready" for a dead navigation and leak an unhandled rejection.
				const error = err instanceof Error ? err.message : String(err);
				this.cleanupView(paneId);
				this.emitStatus({ paneId, status: "error", error });
				return { status: "failed", error };
			}
			if (this.isCancelled(paneId, gen)) {
				this.cleanupView(paneId);
				return { status: "failed", error: "cancelled" };
			}
			this.emitStatus({ paneId, status: "ready" });
			return { status: "ready", port: shared.port };
		}
		// Loop always returns on the final attempt via the catch branch.
		const message =
			lastError instanceof Error ? lastError.message : String(lastError);
		return { status: "failed", error: message };
	}

	private async ensureShared(): Promise<
		SharedServer | { error: VscodeStartResult }
	> {
		if (this.shared) return this.shared;
		if (this.sharedPending) return this.sharedPending;

		const launch = async (): Promise<
			SharedServer | { error: VscodeStartResult }
		> => {
			const isAvailable =
				this.deps.isCodeCliAvailable ?? defaultIsCodeCliAvailable;
			if (!(await isAvailable())) {
				return { error: { status: "cli-missing" } };
			}

			const preferred = this.deps.preferredPort;
			const pidFilePath = this.deps.pidFilePath;
			// Reclaim before port selection: a surviving child from a prior
			// main-process lifetime (dev hot-reload / crash) will still be
			// listening on `preferred`, and without this step
			// `isPortAvailable(preferred)` returns false and we fall through
			// to an ephemeral port — which changes the browser origin and
			// wipes the IndexedDB bucket that stores VS Code UI state.
			if (pidFilePath) {
				const reclaimed = reclaimOrphanServer({ pidFilePath });
				if (reclaimed && preferred !== undefined) {
					await waitForPortAvailable(preferred, 2000, 100);
				}
			}
			const findPort = this.deps.findFreePort ?? defaultFindFreePort;
			const port =
				preferred !== undefined && (await isPortAvailable(preferred))
					? preferred
					: await findPort();

			const server =
				this.deps.createServer?.(port) ??
				new VscodeServer({
					command: "code",
					// Unused by the CLI; `appendFolderParam()` drives per-pane
					// folder selection via the web UI query string.
					worktreePath: "",
					port,
					env: await getProcessEnvWithShellPath(),
					serverDataDir: this.deps.serverDataDir,
					pidFilePath,
				});

			let ready = false;
			const readyUrl = new Promise<string>((resolve, reject) => {
				server.once("ready", (info: { url: string }) => {
					ready = true;
					resolve(info.url);
				});
				server.on(
					"exit",
					(info: {
						code: number | null;
						signal: NodeJS.Signals | null;
						outputTail?: string;
					}) => {
						this.shared = null;
						const tail = info.outputTail?.trim();
						const detail = `code=${info.code ?? "null"}${tail ? `\n${tail}` : ""}`;
						// Surface the exit to every currently-attached pane so the
						// renderer drops back to the "failed" phase, not a half-
						// loaded view pointing at a dead server.
						for (const paneId of this.entries.keys()) {
							this.emitStatus({
								paneId,
								status: "exited",
								error: `exited (${detail})`,
							});
						}
						if (!ready) {
							reject(new Error(`child exited before ready (${detail})`));
						}
					},
				);
				server.on("stderr", (chunk: string) => {
					console.warn("[vscode:shared] stderr:", chunk.trimEnd());
				});
				server.on("stdout", (chunk: string) => {
					console.log("[vscode:shared] stdout:", chunk.trimEnd());
				});
				void server.start();
			});
			// Prevent unhandled-rejection warnings when no pane is waiting on
			// readyUrl at the moment the server exits (e.g. after all panes
			// closed but before the next `start()` awaits it).
			readyUrl.catch(() => {});

			const shared: SharedServer = { server, port, readyUrl };
			this.shared = shared;
			return shared;
		};

		this.sharedPending = launch();
		try {
			return await this.sharedPending;
		} finally {
			this.sharedPending = null;
		}
	}

	setBounds(paneId: string, bounds: VscodeBounds): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.view.setBounds({
			x: Math.round(bounds.x),
			y: Math.round(bounds.y),
			width: Math.max(0, Math.round(bounds.width)),
			height: Math.max(0, Math.round(bounds.height)),
		});
	}

	setVisible(paneId: string, visible: boolean): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.view.setVisible(visible);
	}

	/**
	 * Transfer OS-level keyboard focus to the embedded webContents. Needed
	 * because the main window's document-level keydown listeners (react-
	 * hotkeys-hook) keep swallowing VS Code shortcuts like `Cmd+P` unless
	 * the child view is explicitly made first responder.
	 */
	focus(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		try {
			entry.view.webContents.focus();
		} catch {
			// webContents may be destroyed mid-teardown
		}
	}

	/**
	 * Snapshot the current frame of the embedded webContents as a PNG data
	 * URL. The renderer paints this as a backing image on the pane container
	 * right before hiding the native view, so overlays (dropdowns, cmdk,
	 * dialogs) render over a frozen IDE image instead of the BrowserWindow
	 * background color flashing through.
	 */
	async capture(paneId: string): Promise<string | null> {
		const entry = this.entries.get(paneId);
		if (!entry) return null;
		try {
			const image = await entry.view.webContents.capturePage();
			if (image.isEmpty()) return null;
			return image.toDataURL();
		} catch {
			// webContents may be destroyed or mid-navigation
			return null;
		}
	}

	stop(paneId: string): void {
		// Invalidate any in-flight doStart() for this pane — otherwise it can
		// still attach a WebContentsView seconds after the tab was closed.
		this.startGen.set(paneId, (this.startGen.get(paneId) ?? 0) + 1);
		this.cleanupView(paneId);
		if (this.entries.size === 0) {
			this.stopSharedServer();
		}
	}

	stopAll(): void {
		for (const paneId of [...this.entries.keys()]) {
			this.startGen.set(paneId, (this.startGen.get(paneId) ?? 0) + 1);
			this.cleanupView(paneId);
		}
		this.stopSharedServer();
	}

	has(paneId: string): boolean {
		return this.entries.has(paneId);
	}

	private cleanupView(paneId: string): void {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		this.entries.delete(paneId);
		const window = this.deps.getWindow();
		try {
			if (window && !window.isDestroyed()) {
				window.contentView.removeChildView(entry.view);
			}
		} catch {
			// view may already be detached
		}
		try {
			entry.view.webContents.close();
		} catch {
			// webContents may already be destroyed
		}
	}

	private stopSharedServer(): void {
		if (!this.shared) return;
		try {
			this.shared.server.stop();
		} catch {
			// process may already be gone
		}
		this.shared = null;
	}

	private emitStatus(event: VscodeStatusEvent): void {
		this.emit("status", event);
		this.emit(`status:${event.paneId}`, event);
	}

	private emitFocus(event: VscodeFocusEvent): void {
		this.emit("focus", event);
		this.emit(`focus:${event.paneId}`, event);
	}

	private requireBrowserSessionDir(): string {
		const dir = this.deps.browserSessionDir;
		if (!dir) {
			throw new Error(
				"VscodeManager: browserSessionDir is required when no createView override is provided",
			);
		}
		return dir;
	}
}
