/**
 * SSH Config Parser
 *
 * Parses ~/.ssh/config file to extract host configurations.
 * Supports common SSH config directives.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SSHAuthMethod, SSHConnectionConfig } from "./types";

interface SSHConfigHost {
	name: string;
	hostName?: string;
	user?: string;
	port?: number;
	identityFile?: string;
	forwardAgent?: boolean;
	proxyJump?: string;
}

/**
 * Parse SSH config file and extract host configurations
 */
export function parseSSHConfig(configPath?: string): SSHConfigHost[] {
	const sshConfigPath = configPath ?? path.join(os.homedir(), ".ssh", "config");

	if (!fs.existsSync(sshConfigPath)) {
		console.log(`[ssh-config] No SSH config found at ${sshConfigPath}`);
		return [];
	}

	const content = fs.readFileSync(sshConfigPath, "utf-8");
	const lines = content.split("\n");
	const hosts: SSHConfigHost[] = [];
	let currentHost: SSHConfigHost | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();

		// Skip comments and empty lines
		if (line.startsWith("#") || line === "") {
			continue;
		}

		// Parse key-value pairs (supports both "Key Value" and "Key=Value")
		const match = line.match(/^(\S+)\s*[=\s]\s*(.+)$/);
		if (!match) {
			continue;
		}

		const [, key, value] = match;
		const keyLower = key.toLowerCase();

		if (keyLower === "host") {
			// Skip wildcard hosts
			if (value.includes("*") || value.includes("?")) {
				currentHost = null;
				continue;
			}

			// Start a new host entry
			if (currentHost) {
				hosts.push(currentHost);
			}
			currentHost = { name: value };
		} else if (currentHost) {
			// Add properties to current host
			switch (keyLower) {
				case "hostname":
					currentHost.hostName = value;
					break;
				case "user":
					currentHost.user = value;
					break;
				case "port": {
					const port = parseInt(value, 10);
					if (Number.isInteger(port) && port >= 1 && port <= 65535) {
						currentHost.port = port;
					}
					break;
				}
				case "identityfile":
					// Expand ~ to home directory
					currentHost.identityFile = value.replace(/^~/, os.homedir());
					break;
				case "forwardagent":
					currentHost.forwardAgent = value.toLowerCase() === "yes";
					break;
				case "proxyjump":
					currentHost.proxyJump = value;
					break;
			}
		}
	}

	// Don't forget the last host
	if (currentHost) {
		hosts.push(currentHost);
	}

	console.log(
		`[ssh-config] Parsed ${hosts.length} hosts from ${sshConfigPath}`,
	);
	return hosts;
}

/**
 * Convert parsed SSH config hosts to SSHConnectionConfig format
 */
export function convertToConnectionConfigs(
	hosts: SSHConfigHost[],
): Omit<SSHConnectionConfig, "id">[] {
	return hosts
		.filter((host) => {
			// Must have either a hostname or use the host name as hostname
			return host.hostName || host.name;
		})
		.map((host) => {
			// Determine auth method
			let authMethod: SSHAuthMethod = "agent"; // Default to agent
			if (host.identityFile) {
				authMethod = "key";
			}

			return {
				name: host.name,
				host: host.hostName ?? host.name,
				port: host.port ?? 22,
				username: host.user ?? os.userInfo().username,
				authMethod,
				privateKeyPath: host.identityFile,
				agentForward: host.forwardAgent,
			};
		});
}

/**
 * Get all SSH hosts from config file as connection configs
 */
export function getSSHConfigHosts(
	configPath?: string,
): Omit<SSHConnectionConfig, "id">[] {
	const hosts = parseSSHConfig(configPath);
	return convertToConnectionConfigs(hosts);
}

/**
 * Check if SSH config file exists
 */
export function hasSSHConfig(configPath?: string): boolean {
	const sshConfigPath = configPath ?? path.join(os.homedir(), ".ssh", "config");
	return fs.existsSync(sshConfigPath);
}
