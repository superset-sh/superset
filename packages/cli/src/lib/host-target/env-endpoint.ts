import { readFileSync } from "node:fs";
import { CLIError } from "@superset/cli-framework";

export interface EnvHostEndpoint {
	endpoint: string;
	authToken: string;
}

/**
 * Explicit host-service endpoint override for environments where manifest
 * discovery cannot work — chiefly sandboxed workspace containers, where the
 * manifest's `127.0.0.1` endpoint isn't routable and its recorded PID
 * belongs to another PID namespace. Superset injects both variables into
 * sandbox terminals; the token file is a per-workspace credential mounted
 * read-only into the container (never the org PSK).
 */
export function getEnvHostEndpoint(): EnvHostEndpoint | null {
	const endpoint = process.env.SUPERSET_HOST_ENDPOINT?.trim();
	if (!endpoint) return null;
	const tokenFile = process.env.SUPERSET_HOST_TOKEN_FILE?.trim();
	if (!tokenFile) {
		throw new CLIError(
			"SUPERSET_HOST_ENDPOINT is set but SUPERSET_HOST_TOKEN_FILE is not",
			"Both are injected together by Superset; unset SUPERSET_HOST_ENDPOINT to use normal host discovery.",
		);
	}
	let authToken: string;
	try {
		authToken = readFileSync(tokenFile, "utf-8").trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CLIError(
			`Failed to read host token file at ${tokenFile}: ${message}`,
			"Unset SUPERSET_HOST_ENDPOINT to use normal host discovery.",
		);
	}
	if (!authToken) {
		throw new CLIError(
			`Host token file at ${tokenFile} is empty`,
			"Unset SUPERSET_HOST_ENDPOINT to use normal host discovery.",
		);
	}
	return { endpoint, authToken };
}
