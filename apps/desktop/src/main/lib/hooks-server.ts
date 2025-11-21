import http from "node:http";
import { Notification, type BrowserWindow } from "electron";

const DEFAULT_PORT = 31415;

let server: http.Server | null = null;

/**
 * Starts an HTTP server that listens for agent hook callbacks.
 * Claude's Stop hook can call: curl "http://localhost:PORT/hook/complete?tabId=XXX"
 */
export function startHooksServer(window: BrowserWindow): number {
	const port = DEFAULT_PORT;

	server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://localhost:${port}`);

		// CORS headers for flexibility
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		if (url.pathname === "/hook/complete") {
			const tabId = url.searchParams.get("tabId");
			const tabTitle = url.searchParams.get("tabTitle") || "Terminal";
			const workspaceName = url.searchParams.get("workspaceName") || "Workspace";

			if (!tabId) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Missing tabId parameter" }));
				return;
			}

			// Send event to renderer to update tab state
			window.webContents.send("agent-hook:complete", { tabId });

			// Show native push notification
			if (Notification.isSupported()) {
				const notification = new Notification({
					title: `Agent Complete — ${workspaceName}`,
					body: `"${tabTitle}" has finished its task`,
					silent: false,
				});
				notification.on("click", () => {
					window.show();
					window.focus();
					// Clear the attention state when notification is clicked
					window.webContents.send("agent-hook:dismiss", { tabId });
				});
				notification.show();
			}

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ success: true, tabId }));
			return;
		}

		// Health check endpoint
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
			return;
		}

		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found" }));
	});

	server.listen(port, "127.0.0.1", () => {
		console.log(`[hooks-server] Listening on http://127.0.0.1:${port}`);
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error(
				`[hooks-server] Port ${port} is already in use. Hook callbacks will not work.`,
			);
		} else {
			console.error("[hooks-server] Server error:", err);
		}
	});

	return port;
}

export function stopHooksServer(): void {
	if (server) {
		server.close();
		server = null;
	}
}

export function getHooksServerPort(): number {
	return DEFAULT_PORT;
}
