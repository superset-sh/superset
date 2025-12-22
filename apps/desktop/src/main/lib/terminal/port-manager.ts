import { EventEmitter } from "node:events";
import net from "node:net";

export interface DetectedPort {
	port: number;
	paneId: string;
	workspaceId: string;
	detectedAt: number;
	contextLine: string;
}

// How often to check if ports are still running (in ms)
const HEALTH_CHECK_INTERVAL = 5000;

// Timeout for connection check (in ms) - 2s provides margin for loaded machines
const CONNECTION_TIMEOUT = 2000;

/**
 * Check if a port is listening on a specific host
 */
function checkPortOnHost(port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = new net.Socket();

		const cleanup = () => {
			socket.removeAllListeners();
			socket.destroy();
		};

		socket.setTimeout(CONNECTION_TIMEOUT);

		socket.on("connect", () => {
			cleanup();
			resolve(true);
		});

		socket.on("timeout", () => {
			cleanup();
			resolve(false);
		});

		socket.on("error", () => {
			cleanup();
			resolve(false);
		});

		socket.connect(port, host);
	});
}

/**
 * Check if a port is listening by attempting TCP connections on both IPv4 and IPv6
 */
async function isPortListening(port: number): Promise<boolean> {
	// Check both IPv4 and IPv6, return true if either succeeds
	const [ipv4, ipv6] = await Promise.all([
		checkPortOnHost(port, "127.0.0.1"),
		checkPortOnHost(port, "::1"),
	]);
	return ipv4 || ipv6;
}

// Port detection patterns for common frameworks
const PORT_PATTERNS = [
	// Node.js/Express - "listening on port 3000" or "listening at :3000"
	/listening (?:on|at) (?:port |:)?(\d{2,5})/i,
	// Server started - "server running on port 3000"
	/server (?:running|started|is running) (?:on|at) (?:port |:)?(\d{2,5})/i,
	// localhost:PORT patterns
	/localhost:(\d{2,5})/i,
	// IP:PORT patterns
	/127\.0\.0\.1:(\d{2,5})/i,
	/0\.0\.0\.0:(\d{2,5})/i,
	// HTTP URLs with port
	/https?:\/\/[^:/]+:(\d{2,5})/i,
	// Vite/Next.js/React - "ready on http://...:3000" or "started at http://...:3000"
	/(?:ready|started|running) (?:on|at|in) (?:http:\/\/)?[^:]*:(\d{2,5})/i,
	// Generic port binding - "bound to port 3000" or "binding to :3000"
	/(?:bound to|binding to) (?:port )?:?(\d{2,5})/i,
	// Fastify - "Server listening at"
	/server listening at .*:(\d{2,5})/i,
	// Django/Flask - "Development server is running"
	/development server .*:(\d{2,5})/i,
	// Python http.server - "Serving HTTP on 0.0.0.0 port 8000"
	/serving (?:http|https) on .* port (\d{2,5})/i,
	// Java/Spring Boot - "Tomcat started on port(s): 8080"
	/started on port\(s\):? ?(\d{2,5})/i,
	// Generic "on port X" pattern (catches many frameworks)
	/\bon port (\d{2,5})\b/i,
];

// Ports to ignore (common system/ephemeral ports)
const IGNORED_PORTS = new Set([80, 443]);

// Patterns indicating port is in use by something else (not this terminal)
const PORT_IN_USE_PATTERNS = [
	/port.+(?:is\s+)?(?:already\s+)?in\s+use/i,
	/address\s+(?:already\s+)?in\s+use/i,
	/EADDRINUSE/,
	/port.+(?:is\s+)?(?:being\s+)?used\s+by/i,
	/bind.*failed/i,
	/cannot\s+bind/i,
];

// Delay before verifying a detected port (ms) - gives server time to fully start
const VERIFICATION_DELAY = 500;

// Max buffer size for incomplete lines (bytes) - prevents memory issues with pathological input
const MAX_LINE_BUFFER = 4096;

/**
 * Check if a line indicates a port-in-use error (someone else owns the port)
 */
function isPortInUseError(line: string): boolean {
	return PORT_IN_USE_PATTERNS.some((pattern) => pattern.test(line));
}

function extractPort(line: string): number | null {
	// Skip lines that indicate port is in use by something else
	if (isPortInUseError(line)) {
		return null;
	}

	for (const pattern of PORT_PATTERNS) {
		const match = line.match(pattern);
		if (match?.[1]) {
			const port = Number.parseInt(match[1], 10);
			// Valid port range: 1024-65535 (user ports), excluding common ignored ports
			if (port >= 1024 && port <= 65535 && !IGNORED_PORTS.has(port)) {
				return port;
			}
		}
	}
	return null;
}

class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>();
	private pendingVerification = new Set<string>(); // Ports currently being verified
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private isCheckingHealth = false;
	private lineBuffers = new Map<string, string>(); // Buffer incomplete lines per pane

	constructor() {
		super();
		this.startHealthCheck();
	}

	private makeKey(paneId: string, port: number): string {
		return `${paneId}:${port}`;
	}

	/**
	 * Start periodic health checks for all tracked ports
	 */
	private startHealthCheck(): void {
		if (this.healthCheckInterval) return;

		this.healthCheckInterval = setInterval(() => {
			this.checkPortsHealth();
		}, HEALTH_CHECK_INTERVAL);

		// Don't prevent Node from exiting
		this.healthCheckInterval.unref();
	}

	/**
	 * Stop the health check interval
	 */
	stopHealthCheck(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = null;
		}
	}

	/**
	 * Check all tracked ports and remove any that are no longer listening
	 */
	private async checkPortsHealth(): Promise<void> {
		// Prevent concurrent health checks
		if (this.isCheckingHealth || this.ports.size === 0) return;
		this.isCheckingHealth = true;

		try {
			// Check each tracked port
			const checkPromises = Array.from(this.ports.values()).map(
				async (detectedPort) => {
					const isListening = await isPortListening(detectedPort.port);
					if (!isListening) {
						this.removePort(detectedPort.paneId, detectedPort.port);
					}
				},
			);

			await Promise.all(checkPromises);
		} finally {
			this.isCheckingHealth = false;
		}
	}

	/**
	 * Check if a port number is already tracked by any pane
	 */
	private isPortTracked(port: number): boolean {
		for (const detectedPort of this.ports.values()) {
			if (detectedPort.port === port) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Schedule a port to be added after verification.
	 * This verifies the port is actually listening before adding it,
	 * which filters out false positives like "Port 3000 is in use" messages.
	 * Only one entry per port number is allowed globally to prevent
	 * tracking ports that belong to other panes.
	 */
	schedulePortVerification(
		port: number,
		paneId: string,
		workspaceId: string,
		contextLine: string,
	): void {
		const key = this.makeKey(paneId, port);

		// Don't verify if already tracked by this pane or already verifying
		if (this.ports.has(key) || this.pendingVerification.has(key)) {
			return;
		}

		// Don't track if this port is already tracked by another pane
		if (this.isPortTracked(port)) {
			return;
		}

		this.pendingVerification.add(key);

		// Wait a short time for the server to fully start, then verify
		setTimeout(async () => {
			try {
				// Double-check port isn't tracked yet (could have been added while waiting)
				if (this.isPortTracked(port)) {
					return;
				}
				const isListening = await isPortListening(port);
				if (isListening && !this.ports.has(key) && !this.isPortTracked(port)) {
					this.addPortDirect(port, paneId, workspaceId, contextLine);
				}
			} finally {
				this.pendingVerification.delete(key);
			}
		}, VERIFICATION_DELAY);
	}

	/**
	 * Directly add a port without verification (internal use)
	 */
	private addPortDirect(
		port: number,
		paneId: string,
		workspaceId: string,
		contextLine: string,
	): boolean {
		const key = this.makeKey(paneId, port);

		// Don't add duplicate
		if (this.ports.has(key)) {
			return false;
		}

		const detectedPort: DetectedPort = {
			port,
			paneId,
			workspaceId,
			detectedAt: Date.now(),
			contextLine: contextLine.trim().slice(0, 100), // Limit context line length
		};

		this.ports.set(key, detectedPort);
		this.emit("port:add", detectedPort);
		return true;
	}

	/**
	 * Remove a specific port
	 */
	removePort(paneId: string, port: number): void {
		const key = this.makeKey(paneId, port);
		const detectedPort = this.ports.get(key);

		if (detectedPort) {
			this.ports.delete(key);
			this.emit("port:remove", detectedPort);
		}
	}

	removePortsForPane(paneId: string): void {
		const portsToRemove: DetectedPort[] = [];

		for (const [key, port] of this.ports.entries()) {
			if (port.paneId === paneId) {
				portsToRemove.push(port);
				this.ports.delete(key);
			}
		}

		for (const port of portsToRemove) {
			this.emit("port:remove", port);
		}

		// Clear the line buffer for this pane
		this.lineBuffers.delete(paneId);
	}

	getAllPorts(): DetectedPort[] {
		return Array.from(this.ports.values()).sort(
			(a, b) => b.detectedAt - a.detectedAt,
		);
	}

	getPortsByWorkspace(workspaceId: string): DetectedPort[] {
		return this.getAllPorts().filter((p) => p.workspaceId === workspaceId);
	}

	/**
	 * Scan terminal output for port patterns.
	 * Detected ports are verified before being added to ensure they're actually listening.
	 * Handles chunked output by buffering incomplete lines per pane.
	 */
	scanOutput(data: string, paneId: string, workspaceId: string): void {
		// Prepend any buffered incomplete line from previous chunk
		const buffered = this.lineBuffers.get(paneId) || "";
		const combined = buffered + data;

		// Split by newlines
		const parts = combined.split(/\r?\n/);

		// If data doesn't end with a newline, the last part is incomplete - buffer it
		const endsWithNewline = /[\r\n]$/.test(data);
		const completeLines = endsWithNewline ? parts : parts.slice(0, -1);
		const incompleteLine = endsWithNewline ? "" : (parts.at(-1) ?? "");

		// Update buffer (with size limit to prevent memory issues)
		if (incompleteLine && incompleteLine.length <= MAX_LINE_BUFFER) {
			this.lineBuffers.set(paneId, incompleteLine);
		} else {
			this.lineBuffers.delete(paneId);
		}

		// Process complete lines
		for (const line of completeLines) {
			if (!line.trim()) continue;

			const port = extractPort(line);
			if (port !== null) {
				// Schedule verification - port will only be added if it's actually listening
				this.schedulePortVerification(port, paneId, workspaceId, line);
			}
		}
	}
}

export const portManager = new PortManager();
