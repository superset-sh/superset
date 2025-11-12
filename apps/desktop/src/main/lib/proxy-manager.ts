import { EventEmitter } from "node:events";
import http from "node:http";
import httpProxy from "http-proxy";
import type { Workspace } from "../../shared/types";

interface ProxyInstance {
	canonical: number;
	service?: string;
	proxy: httpProxy;
	server: http.Server;
	target?: string;
	active: boolean;
}

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

export class ProxyManager extends EventEmitter {
	private static instance: ProxyManager;
	private proxies: Map<number, ProxyInstance> = new Map();
	private initialized = false;

	private constructor() {
		super();
	}

	static getInstance(): ProxyManager {
		if (!ProxyManager.instance) {
			ProxyManager.instance = new ProxyManager();
		}
		return ProxyManager.instance;
	}

	/**
	 * Initialize proxy servers from workspace configuration
	 */
	async initialize(workspace: Workspace): Promise<void> {
		if (!workspace.ports || workspace.ports.length === 0) {
			return;
		}

		// Stop existing proxies
		await this.stop();

		// Create proxy for each configured port
		for (const portEntry of workspace.ports) {
			const canonical =
				typeof portEntry === "number" ? portEntry : portEntry.port;
			const service =
				typeof portEntry === "object" ? portEntry.name : undefined;

			await this.createProxy(canonical, service);
		}

		this.initialized = true;
	}

	/**
	 * Create a single proxy server
	 */
	private async createProxy(
		canonical: number,
		service?: string,
	): Promise<void> {
		try {
			// Create proxy instance with WebSocket support
			const proxy = httpProxy.createProxyServer({
				ws: true,
				changeOrigin: true,
				xfwd: true,
			});

			// Handle proxy errors
			proxy.on("error", (err, req, res) => {
				console.error(
					`[ProxyManager] Proxy error on port ${canonical}:`,
					err.message,
				);

				// Send 502 Bad Gateway if backend is unavailable
				if (res && "writeHead" in res && !res.headersSent) {
					res.writeHead(502, {
						"Content-Type": "text/plain",
					});
					res.end(
						`Bad Gateway: Unable to connect to backend server${service ? ` (${service})` : ""}`,
					);
				}
			});

			// Create HTTP server
			const server = http.createServer((req, res) => {
				const instance = this.proxies.get(canonical);

				if (!instance || !instance.target) {
					res.writeHead(503, {
						"Content-Type": "text/plain",
					});
					res.end(
						`Service Unavailable: No active backend for port ${canonical}${service ? ` (${service})` : ""}`,
					);
					return;
				}

				proxy.web(req, res, { target: instance.target });
			});

			// Handle WebSocket upgrade
			server.on("upgrade", (req, socket, head) => {
				const instance = this.proxies.get(canonical);

				if (!instance || !instance.target) {
					socket.destroy();
					return;
				}

				proxy.ws(req, socket, head, { target: instance.target });
			});

			// Start listening
			await new Promise<void>((resolve, reject) => {
				server.listen(canonical, "127.0.0.1", () => {
					resolve();
				});

				server.on("error", (err) => {
					console.error(
						`[ProxyManager] Failed to start proxy on port ${canonical}:`,
						err,
					);
					reject(err);
				});
			});

			// Store proxy instance
			this.proxies.set(canonical, {
				canonical,
				service,
				proxy,
				server,
				active: false,
			});
		} catch (error) {
			console.error(
				`[ProxyManager] Error creating proxy for port ${canonical}:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Update proxy targets based on active worktree
	 */
	updateTargets(workspace: Workspace): void {
		if (!this.initialized || !workspace.ports) {
			return;
		}

		const activeWorktree = workspace.worktrees.find(
			(w) => w.id === workspace.activeWorktreeId,
		);

		if (!activeWorktree) {
			this.clearAllTargets();
			return;
		}

		const detectedPorts = activeWorktree.detectedPorts || {};

		// Update each proxy
		for (const [canonical, instance] of this.proxies) {
			let targetPort: number | undefined;

			if (instance.service) {
				// Named port: match by service name
				targetPort = detectedPorts[instance.service];
			} else {
				// Unnamed port: use first available detected port
				// Filter out entries that are port numbers used as keys (e.g., "3000" → 3000)
				const availablePorts = Object.values(detectedPorts);
				if (availablePorts.length > 0) {
					targetPort = availablePorts[0];
				}
			}

			if (targetPort) {
				const target = `http://localhost:${targetPort}`;
				instance.target = target;
				instance.active = true;
			} else {
				instance.target = undefined;
				instance.active = false;
			}
		}

		// Emit update event
		this.emit("proxy-updated", this.getStatus());
	}

	/**
	 * Clear all proxy targets
	 */
	private clearAllTargets(): void {
		for (const instance of this.proxies.values()) {
			instance.target = undefined;
			instance.active = false;
		}

		this.emit("proxy-updated", this.getStatus());
	}

	/**
	 * Get status of all proxies
	 */
	getStatus(): ProxyStatus[] {
		return Array.from(this.proxies.values()).map((instance) => ({
			canonical: instance.canonical,
			target: instance.target
				? Number.parseInt(instance.target.split(":").pop() || "0", 10)
				: undefined,
			service: instance.service,
			active: instance.active,
		}));
	}

	/**
	 * Stop all proxy servers
	 */
	async stop(): Promise<void> {
		const closePromises: Promise<void>[] = [];

		for (const instance of this.proxies.values()) {
			const promise = new Promise<void>((resolve) => {
				instance.server.close(() => {
					resolve();
				});
			});
			closePromises.push(promise);

			// Close the proxy instance
			instance.proxy.close();
		}

		await Promise.all(closePromises);

		this.proxies.clear();
		this.initialized = false;
	}

	/**
	 * Check if proxy manager is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get number of active proxies
	 */
	getActiveProxyCount(): number {
		return Array.from(this.proxies.values()).filter((p) => p.active).length;
	}
}

export const proxyManager = ProxyManager.getInstance();
