import { getHostId } from "@superset/shared/host-info";
import {
	captureTelemetryEvent,
	readTokenIdentity,
	resolveTelemetryKey,
	type TelemetryIdentity,
} from "@superset/shared/product-telemetry";
import { env } from "./env";
import type { AuthSource } from "./resolve-auth";

/** Agents run these in tight loops, millions of times a week. */
const POLLING_COMMANDS = new Set([
	"terminals list",
	"terminals read",
	"workspaces list",
	"status",
]);
const POLLING_SAMPLE_RATE = 100;

function identify(input: {
	bearer: string;
	authSource: AuthSource;
	organizationId: string | undefined;
}): TelemetryIdentity {
	const session =
		input.authSource === "oauth" ? readTokenIdentity(input.bearer) : null;
	return session
		? {
				distinctId: session.userId,
				organizationId: input.organizationId ?? session.organizationId,
			}
		: {
				distinctId: getHostId(),
				organizationId: input.organizationId ?? null,
			};
}

export function trackCommandInvoked(input: {
	bearer: string;
	authSource: AuthSource;
	organizationId: string | undefined;
	commandPath: string[];
	flags: string[];
}): void {
	const key = resolveTelemetryKey(env.SUPERSET_API_URL);
	if (!key) return;
	const command = input.commandPath.join(" ");
	void captureTelemetryEvent({
		key,
		event: "cli_command_invoked",
		identify: () => identify(input),
		sampleRate: POLLING_COMMANDS.has(command) ? POLLING_SAMPLE_RATE : 1,
		properties: {
			source: "cli",
			command,
			flags: input.flags,
			cli_version: env.VERSION,
			auth_source: input.authSource,
		},
	});
}
