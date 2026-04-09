import type { SshConnectionManager } from "./connection-manager";

const SESSION_PREFIX = "superset-";

function shellEscape(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export class ZmxSessionManager {
	constructor(private readonly connectionManager: SshConnectionManager) {}

	sanitizeSessionName(paneId: string): string {
		const sanitizedPaneId = paneId.replaceAll(/[^a-zA-Z0-9_-]/g, "");
		return `${SESSION_PREFIX}${sanitizedPaneId}`;
	}

	async hasSession(paneId: string): Promise<boolean> {
		const sessionName = this.sanitizeSessionName(paneId);
		const result = await this.connectionManager.exec(
			`~/.local/bin/zmx list --short 2>/dev/null | grep -q ${shellEscape(sessionName)}`,
		);
		return result.exitCode === 0;
	}

	async killSession(paneId: string): Promise<void> {
		const sessionName = this.sanitizeSessionName(paneId);
		try {
			await this.connectionManager.exec(
				`~/.local/bin/zmx kill ${shellEscape(sessionName)}`,
			);
		} catch {}
	}

	async listSessions(): Promise<string[]> {
		const result = await this.connectionManager.exec(
			"~/.local/bin/zmx list --short 2>/dev/null",
		);
		return result.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.startsWith(SESSION_PREFIX));
	}
}
