import { env } from "./env";

function decodeJwtSub(token: string): string | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const body = parts[1] ?? "";
		const padded = body
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(body.length + ((4 - (body.length % 4)) % 4), "=");
		const json = JSON.parse(
			Buffer.from(padded, "base64").toString("utf-8"),
		) as { sub?: string };
		return json.sub ?? null;
	} catch {
		return null;
	}
}

/**
 * Fire-and-forget capture of `cli_command_invoked`. Called from CLI middleware
 * at the start of every command — we deliberately don't wait for the request
 * to land because the bun-compiled binary often exits before HTTP completes.
 * `keepalive: true` lets the OS finish the in-flight request after the process
 * is gone (Node 18+ / Bun honor this).
 *
 * Skipped if the user isn't signed in (no JWT → no distinct_id).
 */
export function trackCommandInvoked(input: {
	bearer: string;
	commandPath: string[];
	flags: string[];
}): void {
	const distinctId = decodeJwtSub(input.bearer);
	if (!distinctId) return;

	void fetch(`${env.POSTHOG_HOST}/capture/`, {
		method: "POST",
		keepalive: true,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			api_key: env.POSTHOG_KEY,
			event: "cli_command_invoked",
			distinct_id: distinctId,
			properties: {
				command: input.commandPath.join(" "),
				flags: input.flags,
				cli_version: env.VERSION,
			},
			timestamp: new Date().toISOString(),
		}),
	}).catch(() => {
		// Swallow — telemetry must never affect command execution.
	});
}
