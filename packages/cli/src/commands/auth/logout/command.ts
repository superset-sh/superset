import { CLIError } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";
import { isProcessAlive, readManifest } from "../../../lib/host/manifest";

const HOST_SHUTDOWN_TIMEOUT_MS = 5_000;
const HOST_SHUTDOWN_POLL_MS = 100;

function isNoSuchProcessError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code: unknown }).code === "ESRCH"
	);
}

async function stopRunningHost(
	organizationId: string | undefined,
): Promise<void> {
	if (!organizationId) return;

	const manifest = readManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return;

	try {
		process.kill(manifest.pid, "SIGTERM");
	} catch (error) {
		if (isNoSuchProcessError(error)) return;
		throw new CLIError(
			`Failed to stop host service (pid ${manifest.pid}): ${
				error instanceof Error ? error.message : "unknown error"
			}`,
		);
	}

	const deadline = Date.now() + HOST_SHUTDOWN_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (!isProcessAlive(manifest.pid)) return;
		await new Promise((resolve) => setTimeout(resolve, HOST_SHUTDOWN_POLL_MS));
	}
}

export default command({
	description: "Clear stored credentials",
	skipMiddleware: true,
	run: async () => {
		const config = readConfig();
		await stopRunningHost(config.organizationId);
		delete config.auth;
		delete config.apiKey;
		writeConfig(config);
		return { message: "Logged out." };
	},
});
