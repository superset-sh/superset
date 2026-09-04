import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import {
	type HostServiceClient,
	resolveHostTarget,
} from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
import {
	encodeKeys,
	KNOWN_KEY_NAMES,
	normalizeKeyName,
} from "../../../lib/terminal-keys";

const INTERRUPT_KEYS = new Set(["esc", "escape", "ctrl+c", "ctrl+d", "ctrl+z"]);

/**
 * Interrupted agents fire no hook, so a scripted Esc/Ctrl+C would leave the
 * binding wedged on "working" — mirror the desktop's interrupt clear. Purely
 * best-effort: the keys were already delivered, and an older host-service
 * without `explain` must not turn that success into a failure.
 */
async function clearInterruptedAgentStatus(
	client: HostServiceClient,
	input: { workspaceId: string; terminalId: string },
): Promise<void> {
	try {
		const explanation = await client.terminalAgents.explain.query(input);
		if (
			!explanation.binding ||
			(explanation.derivedStatus !== "working" &&
				explanation.derivedStatus !== "permission")
		) {
			return;
		}
		await client.terminalAgents.clearWorkspaceStatuses.mutate(input);
	} catch (error) {
		console.warn(
			"[terminals send-keys] failed to clear agent status after interrupt:",
			error,
		);
	}
}

export default command({
	description:
		"Send literal key presses (esc, ctrl+c, arrows, ...) to a terminal running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		keys: string()
			.required()
			.desc(
				"Comma-separated key names to send in order, e.g. 'ctrl+c' or 'esc,enter'. Run with an unrecognized name to see the full supported list.",
			),
	},
	run: async ({ ctx, options }) => {
		const keyNames = options.keys
			.split(",")
			.map(normalizeKeyName)
			.filter((name) => name.length > 0);
		if (keyNames.length === 0) {
			throw new CLIError(
				"No key names given",
				`Pass --keys with one or more of: ${KNOWN_KEY_NAMES.join(", ")}, ctrl+<letter>`,
			);
		}

		const { bytes, unknown } = encodeKeys(keyNames);
		if (unknown.length > 0) {
			throw new CLIError(
				`Unrecognized key name${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
				`Supported: ${KNOWN_KEY_NAMES.join(", ")}, ctrl+<letter>`,
			);
		}

		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = options.host ?? getHostId();
		const { workspace } = await findWorkspaceOnHost(
			{ organizationId, userJwt: ctx.bearer, api: ctx.api, hostId },
			options.workspace,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"Pass --host <id> if it lives on another machine",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const input = {
			terminalId: options.terminal,
			workspaceId: options.workspace,
		};
		await target.client.terminal.writeInput.mutate({ ...input, data: bytes });

		if (keyNames.some((name) => INTERRUPT_KEYS.has(name))) {
			await clearInterruptedAgentStatus(target.client, input);
		}

		return {
			data: { terminalId: options.terminal, keys: keyNames },
			message: `Sent ${keyNames.join(" ")} to terminal ${options.terminal}`,
		};
	},
});
