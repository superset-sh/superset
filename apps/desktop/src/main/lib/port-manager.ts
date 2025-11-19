import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PORT = 4927;
const PORT_RANGE_START = 4927;
const PORT_RANGE_END = 4999;
const CONFIG_DIR = join(homedir(), ".superset");
const PORT_CONFIG_FILE = join(CONFIG_DIR, "dev-port.json");

interface PortConfig {
	port: number;
	lastUsed: string;
	workspaceId?: string;
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();

		server.once("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				resolve(false);
			} else {
				resolve(false);
			}
		});

		server.once("listening", () => {
			server.close();
			resolve(true);
		});

		server.listen(port, "127.0.0.1");
	});
}

/**
 * Find the next available port in the range
 */
async function findAvailablePort(startPort: number): Promise<number> {
	for (let port = startPort; port <= PORT_RANGE_END; port++) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}

	// If no port is available in the range, start from the beginning
	for (let port = PORT_RANGE_START; port < startPort; port++) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}

	throw new Error(
		`No available ports found in range ${PORT_RANGE_START}-${PORT_RANGE_END}`,
	);
}

/**
 * Load port configuration from disk
 */
function loadPortConfig(): PortConfig | null {
	try {
		if (!existsSync(PORT_CONFIG_FILE)) {
			return null;
		}
		const data = readFileSync(PORT_CONFIG_FILE, "utf-8");
		return JSON.parse(data);
	} catch (error) {
		console.warn("Failed to load port config:", error);
		return null;
	}
}

/**
 * Save port configuration to disk
 */
function savePortConfig(config: PortConfig): void {
	try {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		writeFileSync(PORT_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
	} catch (error) {
		console.warn("Failed to save port config:", error);
	}
}

/**
 * Get a workspace identifier based on current working directory
 */
function getWorkspaceId(): string {
	// Use the current working directory as a unique identifier
	return process.cwd();
}

/**
 * Get the port for this workspace/instance
 * - First tries the last used port from config file (if available)
 * - If that port is not available, automatically finds the first available port in the range
 * - If no config exists, finds the first available port starting from the beginning of the range
 * - Persists the chosen port for next time
 */
export async function getPort(): Promise<number> {
	const workspaceId = getWorkspaceId();

	// 1. Check last used port from config
	const config = loadPortConfig();
	if (config?.port) {
		// Try the last used port first
		if (await isPortAvailable(config.port)) {
			// Update last used timestamp
			savePortConfig({
				...config,
				lastUsed: new Date().toISOString(),
				workspaceId,
			});
			return config.port;
		}
		console.log(
			`Port ${config.port} is not available, searching for alternative...`,
		);
	}

	// 2. Find the first available port
	// If we had a config but the port wasn't available, start searching from that port
	// Otherwise, start from the beginning of the range to find the first available port
	const startPort = config?.port || PORT_RANGE_START;
	const availablePort = await findAvailablePort(startPort);

	// Save the new port
	savePortConfig({
		port: availablePort,
		lastUsed: new Date().toISOString(),
		workspaceId,
	});

	return availablePort;
}

/**
 * Synchronous version for use in config files
 * Returns the last known port or default, without availability checking
 * The async version should be called during app initialization to ensure correctness
 */
export function getPortSync(): number {
	// 1. Check config file
	const config = loadPortConfig();
	if (config?.port) {
		return config.port;
	}

	// 2. Return default
	return DEFAULT_PORT;
}

/**
 * Reset the port configuration (useful for testing or cleanup)
 */
export function resetPortConfig(): void {
	try {
		if (existsSync(PORT_CONFIG_FILE)) {
			writeFileSync(
				PORT_CONFIG_FILE,
				JSON.stringify(
					{
						port: DEFAULT_PORT,
						lastUsed: new Date().toISOString(),
					},
					null,
					2,
				),
				"utf-8",
			);
		}
	} catch (error) {
		console.warn("Failed to reset port config:", error);
	}
}
