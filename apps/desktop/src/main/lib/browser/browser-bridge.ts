/**
 * Browser bridge — loopback control surface for the in-app browser panes.
 *
 * The host-service child is the only client: it learns the endpoint and
 * secret via BROWSER_BRIDGE_URL / BROWSER_BRIDGE_SECRET at spawn and proxies
 * its own authenticated `browser.*` tRPC procedures (and the raw CDP
 * WebSocket route) here. Nothing else should hold the secret, so it is never
 * written to disk.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import log from "electron-log";
import express, { type Request, type Response } from "express";
import { type WebSocket, WebSocketServer } from "ws";
import { setBrowserBridgeInfo } from "./browser-bridge-info";
import {
	type BrowserOpenRequest,
	browserManager,
	CdpBusyError,
	resolveGuestUrl,
} from "./browser-manager";
import { importCookiesIntoSession } from "./chrome-cookie-import";
import {
	listChromeImportSources,
	resolveImportProfile,
} from "./chrome-history-import";

const OPEN_PANE_TIMEOUT_MS = 15_000;
const MAX_CDP_MESSAGE_BYTES = 4 * 1024 * 1024;
const CDP_PATH = /^\/panes\/([^/]+)\/cdp$/;

let server: Server | null = null;

// Tail of the per-workspace open chain, so concurrent `/open` requests for one
// workspace run one at a time (see the handler for why). Keyed by workspaceId;
// entries delete themselves once the chain drains.
const openQueues = new Map<string, Promise<void>>();
// How many opens are queued per workspace, so a stuck renderer (each open waits
// up to OPEN_PANE_TIMEOUT_MS) can't let the chain grow without bound.
const openDepth = new Map<string, number>();
const MAX_QUEUED_OPENS = 8;

function isAuthorized(secret: string, req: IncomingMessage): boolean {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
	const candidate = bearer ?? url.searchParams.get("token") ?? "";
	const a = Buffer.from(candidate);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Pull the workspaceId every pane op must carry (body for POST, query for
 * GET). The bridge never operates unscoped — a missing workspaceId is a 400,
 * and BrowserManager then rejects a pane that isn't in that workspace.
 */
function requireScope(
	req: Request,
	res: Response,
): { paneId: string; workspaceId: string } | null {
	const paneId = req.params.paneId as string;
	const raw = req.body?.workspaceId ?? req.query.workspaceId;
	if (typeof raw !== "string" || raw.length === 0) {
		res.status(400).json({ error: "workspaceId is required" });
		return null;
	}
	return { paneId, workspaceId: raw };
}

/** Resolve the live, workspace-scoped webContents or 404. */
function withPane(
	req: Request,
	res: Response,
	fn: (wc: Electron.WebContents, paneId: string, workspaceId: string) => void,
): void {
	const scope = requireScope(req, res);
	if (!scope) return;
	const wc = browserManager.getWebContents(scope.paneId, scope.workspaceId);
	if (!wc) {
		res
			.status(404)
			.json({ error: `No live pane ${scope.paneId} in this workspace` });
		return;
	}
	fn(wc, scope.paneId, scope.workspaceId);
}

export async function startBrowserBridge(): Promise<void> {
	if (server) return;
	const secret = randomBytes(32).toString("hex");
	const app = express();
	app.use(express.json({ limit: "2mb" }));

	app.use((req, res, next) => {
		if (!isAuthorized(secret, req)) {
			res.status(401).json({ error: "Unauthorized" });
			return;
		}
		next();
	});

	app.get("/panes", (req, res) => {
		const workspaceId =
			typeof req.query.workspaceId === "string"
				? req.query.workspaceId
				: undefined;
		res.json({ panes: browserManager.listPanes(workspaceId) });
	});

	app.post("/open", (req, res) => {
		const { workspaceId, url, target } = req.body ?? {};
		if (typeof workspaceId !== "string" || typeof url !== "string") {
			res.status(400).json({ error: "workspaceId and url are required" });
			return;
		}
		const resolvedTarget = target === "new-tab" ? "new-tab" : "current-tab";

		// Reject a disallowed scheme up front (clear error, no pane created) and
		// normalize bare input the same way the pane will.
		let resolvedUrl: string;
		try {
			resolvedUrl = resolveGuestUrl(url);
		} catch (err) {
			res.status(400).json({ error: errorMessage(err) });
			return;
		}

		if ((openDepth.get(workspaceId) ?? 0) >= MAX_QUEUED_OPENS) {
			res.status(429).json({
				error:
					"Too many pending browser-open requests for this workspace. Try again once the earlier ones settle.",
			});
			return;
		}

		// Each open resolves to "the first pane registered in this workspace that
		// wasn't already open". The registration event can't tell us which request
		// it belongs to, so two concurrent opens in one workspace would both latch
		// onto the same new pane. Serialize opens per workspace instead: the next
		// one only snapshots `known` (and starts listening) after the previous
		// pane is registered, so each request matches exactly its own pane.
		const run = () =>
			new Promise<void>((resolveOpen) => {
				const requestId = randomBytes(8).toString("hex");
				const known = new Set(
					browserManager.listPanes(workspaceId).map((p) => p.paneId),
				);

				let settled = false;
				const finish = (fn: () => void) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					browserManager.off("pane-registered", onRegistered);
					fn();
					resolveOpen();
				};
				const timer = setTimeout(() => {
					finish(() =>
						res.status(504).json({
							error:
								"No browser pane appeared for this workspace. Is the desktop app running and signed in?",
						}),
					);
				}, OPEN_PANE_TIMEOUT_MS);
				// Client hung up before the pane appeared — stop waiting and free the listener.
				res.on("close", () => finish(() => {}));

				const onRegistered = (event: {
					paneId: string;
					workspaceId: string | null;
				}) => {
					if (event.workspaceId !== workspaceId) return;
					if (known.has(event.paneId)) return;
					const info = browserManager
						.listPanes(workspaceId)
						.find((p) => p.paneId === event.paneId);
					finish(() =>
						res.json({
							paneId: event.paneId,
							url: info?.url ?? resolvedUrl,
							title: info?.title ?? "",
						}),
					);
				};
				browserManager.on("pane-registered", onRegistered);

				browserManager.requestOpen({
					workspaceId,
					url: resolvedUrl,
					target: resolvedTarget,
					requestId,
				} satisfies BrowserOpenRequest);
			});

		openDepth.set(workspaceId, (openDepth.get(workspaceId) ?? 0) + 1);
		const prev = openQueues.get(workspaceId) ?? Promise.resolve();
		const next = prev.then(run, run);
		openQueues.set(workspaceId, next);
		void next.finally(() => {
			openDepth.set(workspaceId, (openDepth.get(workspaceId) ?? 1) - 1);
			if ((openDepth.get(workspaceId) ?? 0) <= 0) openDepth.delete(workspaceId);
			if (openQueues.get(workspaceId) === next) openQueues.delete(workspaceId);
		});
	});

	app.post("/panes/:paneId/navigate", (req, res) => {
		const scope = requireScope(req, res);
		if (!scope) return;
		const url = req.body?.url;
		if (typeof url !== "string") {
			res.status(400).json({ error: "url is required" });
			return;
		}
		// A disallowed scheme is a bad request (400); a missing pane is a 404.
		let resolvedUrl: string;
		try {
			resolvedUrl = resolveGuestUrl(url);
		} catch (err) {
			res.status(400).json({ error: errorMessage(err) });
			return;
		}
		try {
			browserManager.navigate(scope.paneId, resolvedUrl, scope.workspaceId);
			res.json({ ok: true });
		} catch (err) {
			res.status(404).json({ error: errorMessage(err) });
		}
	});

	app.post("/panes/:paneId/back", (req, res) => {
		withPane(req, res, (wc) => {
			if (wc.canGoBack()) wc.goBack();
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/forward", (req, res) => {
		withPane(req, res, (wc) => {
			if (wc.canGoForward()) wc.goForward();
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/reload", (req, res) => {
		withPane(req, res, (wc) => {
			if (req.body?.hard) {
				wc.reloadIgnoringCache();
			} else {
				wc.reload();
			}
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/screenshot", (req, res) => {
		const scope = requireScope(req, res);
		if (!scope) return;
		browserManager
			.capturePng(scope.paneId, scope.workspaceId)
			.then((base64) => res.json({ base64 }))
			.catch((err) => res.status(404).json({ error: errorMessage(err) }));
	});

	app.post("/panes/:paneId/eval", (req, res) => {
		const scope = requireScope(req, res);
		if (!scope) return;
		const code = req.body?.code;
		if (typeof code !== "string") {
			res.status(400).json({ error: "code is required" });
			return;
		}
		browserManager
			.evaluateJS(scope.paneId, code, scope.workspaceId)
			.then((result) => res.json({ result: result ?? null }))
			.catch((err) => res.status(500).json({ error: errorMessage(err) }));
	});

	app.get("/panes/:paneId/console", (req, res) => {
		withPane(req, res, (_wc, paneId, workspaceId) => {
			res.json({ entries: browserManager.getConsoleLogs(paneId, workspaceId) });
		});
	});

	// Chromium browsers/profiles whose history and logins can be imported.
	app.get("/import-sources", (_req, res) => {
		res.json({ sources: listChromeImportSources() });
	});

	// Import logins (cookies) from a system browser into this pane's session.
	app.post("/panes/:paneId/import-cookies", (req, res) => {
		const scope = requireScope(req, res);
		if (!scope) return;
		const sourceId = req.body?.sourceId;
		if (typeof sourceId !== "string" || sourceId.length === 0) {
			res.status(400).json({ error: "sourceId is required" });
			return;
		}
		const profile = resolveImportProfile(sourceId);
		if (!profile) {
			res.status(404).json({ error: "Unknown import source" });
			return;
		}
		const wc = browserManager.getWebContents(scope.paneId, scope.workspaceId);
		if (!wc) {
			res
				.status(404)
				.json({ error: `No live pane ${scope.paneId} in this workspace` });
			return;
		}
		importCookiesIntoSession(wc.session, profile.profileDir, profile.browserKey)
			.then((result) => res.json(result))
			.catch((err) => res.status(500).json({ error: errorMessage(err) }));
	});

	const wss = new WebSocketServer({
		noServer: true,
		maxPayload: MAX_CDP_MESSAGE_BYTES,
	});

	const httpServer = await new Promise<Server>((resolve, reject) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
		s.on("error", reject);
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const match = CDP_PATH.exec(url.pathname);
		const workspaceId = url.searchParams.get("workspaceId");
		if (!match || !workspaceId || !isAuthorized(secret, req)) {
			socket.destroy();
			return;
		}
		const paneId = match[1] as string;
		wss.handleUpgrade(req, socket, head, (ws) => {
			handleCdpSocket(paneId, workspaceId, ws);
		});
	});

	const address = httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("Browser bridge failed to bind a port");
	}
	server = httpServer;
	const endpoint = `http://127.0.0.1:${address.port}`;
	setBrowserBridgeInfo({ endpoint, secret });
	log.info(`[browser-bridge] listening on ${endpoint}`);
}

function handleCdpSocket(
	paneId: string,
	workspaceId: string,
	ws: WebSocket,
): void {
	let session: ReturnType<typeof browserManager.attachCdp>;
	try {
		session = browserManager.attachCdp(
			paneId,
			workspaceId,
			(payload) => {
				if (ws.readyState === ws.OPEN) ws.send(payload);
			},
			(reason) => {
				ws.close(1011, `debugger detached: ${reason}`.slice(0, 100));
			},
		);
	} catch (err) {
		// 1013 (Try Again Later) tells the client the pane is busy with another
		// CDP session and to retry once it disconnects; 1011 = genuine failure.
		const code = err instanceof CdpBusyError ? 1013 : 1011;
		ws.close(code, errorMessage(err).slice(0, 100));
		return;
	}
	ws.on("message", (data) => {
		session.send(data.toString());
	});
	ws.on("close", () => {
		session.detach();
	});
	ws.on("error", () => {
		session.detach();
	});
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
