import { app } from "electron";
import { getTerminalDaemonRegistry } from "./daemon-registry";

function sanitizeGenerationPart(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9.-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function getTerminalDaemonAppVersion(): string {
	try {
		return app.getVersion();
	} catch {
		return process.env.npm_package_version || "0.0.0";
	}
}

export function getTerminalGenerationIdForVersion(appVersion: string): string {
	const sanitized = sanitizeGenerationPart(appVersion);
	return sanitized.length > 0 ? `v${sanitized}` : "v0.0.0";
}

export function getCurrentTerminalGenerationId(): string {
	return getTerminalGenerationIdForVersion(getTerminalDaemonAppVersion());
}

export function getPreferredGenerationId(): string {
	const registry = getTerminalDaemonRegistry();
	registry.cleanupStaleDaemons();

	const currentAppVersion = getTerminalDaemonAppVersion();
	const currentGenerationId =
		getTerminalGenerationIdForVersion(currentAppVersion);
	const currentEntry = registry.get(currentGenerationId);
	if (currentEntry?.state === "preferred") {
		return currentGenerationId;
	}

	return currentGenerationId;
}

export function markGenerationPreferred(generationId: string): void {
	const registry = getTerminalDaemonRegistry();
	registry.cleanupStaleDaemons();
	registry.markPreferredGeneration(generationId);
}

export function listDrainingGenerations(): string[] {
	const registry = getTerminalDaemonRegistry();
	registry.cleanupStaleDaemons();
	return registry
		.listActive()
		.filter((entry) => entry.state === "draining")
		.map((entry) => entry.generationId);
}

export function markGenerationDraining(generationId: string): void {
	const registry = getTerminalDaemonRegistry();
	registry.setState(generationId, "draining");
}

export function markGenerationRetired(generationId: string): void {
	const registry = getTerminalDaemonRegistry();
	registry.setState(generationId, "retired");
}
