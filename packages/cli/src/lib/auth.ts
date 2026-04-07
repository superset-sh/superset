import { CLIError } from "@superset/cli-framework";
import { readConfig, writeConfig } from "./config";

// Well-known OAuth client ID for the Superset CLI.
// Registered via dynamic client registration on first use.
const CLI_CLIENT_NAME = "Superset CLI";

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
};

type DeviceTokenResponse = {
	access_token: string;
	token_type: string;
};

/**
 * OAuth 2.0 Device Authorization Flow (RFC 8628).
 */
export type DeviceAuthResult = {
	token: string;
	userCode: string;
	verificationUrl: string;
};

export async function deviceAuth(
	apiUrl: string,
	signal: AbortSignal,
): Promise<DeviceAuthResult> {
	const clientId = await ensureClientId(apiUrl);

	// Step 1: Request device code
	const codeRes = await fetch(`${apiUrl}/api/auth/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: clientId }),
	});

	if (!codeRes.ok) {
		const body = await codeRes.text();
		throw new CLIError(
			`Failed to start auth flow: ${codeRes.status} ${body}`,
			"Is the API running?",
		);
	}

	const codeData = (await codeRes.json()) as DeviceCodeResponse;

	// Step 2: Open browser with pre-filled code
	const verificationUrl =
		codeData.verification_uri_complete || codeData.verification_uri;

	const openCmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";

	const { exec } = await import("node:child_process");
	exec(`${openCmd} "${verificationUrl}"`);

	// Step 3: Poll for token
	const interval = (codeData.interval || 5) * 1000;
	const deadline = Date.now() + codeData.expires_in * 1000;

	while (Date.now() < deadline) {
		if (signal.aborted) {
			throw new CLIError("Login cancelled");
		}

		await sleep(interval);

		const tokenRes = await fetch(`${apiUrl}/api/auth/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_code: codeData.device_code,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				client_id: clientId,
			}),
		});

		if (tokenRes.ok) {
			const tokenData = (await tokenRes.json()) as DeviceTokenResponse;
			return {
				token: tokenData.access_token,
				userCode: codeData.user_code,
				verificationUrl,
			};
		}

		const error = (await tokenRes.json()) as { error?: string };

		if (error.error === "authorization_pending") {
			continue;
		}
		if (error.error === "slow_down") {
			await sleep(5000);
			continue;
		}
		if (error.error === "access_denied") {
			throw new CLIError("Authorization denied by user");
		}
		if (error.error === "expired_token") {
			throw new CLIError("Authorization expired — please try again");
		}

		throw new CLIError(`Auth error: ${error.error ?? tokenRes.status}`);
	}

	throw new CLIError("Authorization timed out — please try again");
}

/**
 * Ensure we have a registered OAuth client ID for this API.
 * Registers one via dynamic client registration on first use,
 * then caches it in ~/.superset/config.json.
 */
async function ensureClientId(apiUrl: string): Promise<string> {
	const config = readConfig();
	const cached = config.clientIds?.[apiUrl];
	if (cached) return cached;

	// Register a new public client
	const res = await fetch(`${apiUrl}/api/auth/oauth2/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: CLI_CLIENT_NAME,
			redirect_uris: ["http://localhost/callback"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});

	if (!res.ok) {
		throw new CLIError(
			`Failed to register CLI client: ${res.status}`,
			"Is the API running?",
		);
	}

	const data = (await res.json()) as { client_id: string };
	const clientId = data.client_id;

	// Cache it
	if (!config.clientIds) config.clientIds = {};
	config.clientIds[apiUrl] = clientId;
	writeConfig(config);

	return clientId;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
