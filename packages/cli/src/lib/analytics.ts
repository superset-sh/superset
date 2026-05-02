import { PostHog } from "posthog-node";
import { env } from "./env";

const posthog =
	env.POSTHOG_KEY && env.POSTHOG_HOST
		? new PostHog(env.POSTHOG_KEY, {
				host: env.POSTHOG_HOST,
				flushAt: 1,
				flushInterval: 0,
			})
		: null;

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

export function trackCommandInvoked(input: {
	bearer: string;
	commandPath: string[];
	flags: string[];
}): void {
	if (!posthog) return;
	const distinctId = decodeJwtSub(input.bearer);
	if (!distinctId) return;

	posthog.capture({
		distinctId,
		event: "cli_command_invoked",
		properties: {
			command: input.commandPath.join(" "),
			flags: input.flags,
			cli_version: env.VERSION,
		},
	});
}
