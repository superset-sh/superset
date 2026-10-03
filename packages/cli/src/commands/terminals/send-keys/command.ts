import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import type { HostServiceClient } from "../../../lib/host-target";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	KNOWN_KEY_NAMES,
	normalizeKeyName,
	planKeyWrites,
} from "../../../lib/terminal-keys";

/** The keys the desktop pane treats as an interrupt (useTerminalInterruptClear). */
export const INTERRUPT_KEYS: ReadonlySet<string> = new Set([
	"esc",
	"escape",
	"ctrl+c",
]);

const SUPPORTED = `Supported: ${KNOWN_KEY_NAMES.join(", ")}, ctrl+<letter>`;

/**
 * An interrupted agent fires no Stop hook, so its binding would stay
 * "working" or "permission" until its next turn. The desktop clears it on
 * the keypress; this is the same gate and the same silent mutation. A
 * failure here must not fail the command: the keys were already delivered.
 */
async function clearInterruptedAgentStatus(
	client: HostServiceClient,
	input: { workspaceId: string; terminalId: string },
): Promise<boolean> {
	try {
		const bindings = await client.terminalAgents.listByWorkspace.query({
			workspaceId: input.workspaceId,
		});
		const binding = bindings.find(
			(candidate) => candidate.terminalId === input.terminalId,
		);
		if (
			binding?.lastEventType !== "Start" &&
			binding?.lastEventType !== "PermissionRequest"
		) {
			return false;
		}
		await client.terminalAgents.clearWorkspaceStatuses.mutate(input);
		return true;
	} catch (error) {
		console.warn(
			`[terminals send-keys] keys were sent, but clearing the agent status of terminal ${input.terminalId} failed:`,
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}

export default command({
	description:
		"Press keys (esc, ctrl+c, enter, arrows, ...) in a terminal running in a workspace, the way a person at the keyboard would",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		keys: string()
			.required()
			.desc(
				`Comma-separated key names pressed in order, e.g. 'ctrl+c' or 'esc,enter'. ${SUPPORTED}`,
			),
	},
	run: async ({ ctx, options }) => {
		const names = options.keys
			.split(",")
			.map(normalizeKeyName)
			.filter((name) => name.length > 0);
		if (names.length === 0) {
			throw new CLIError("No key names given", `Pass --keys. ${SUPPORTED}`);
		}

		const { writes, unknown } = planKeyWrites(names);
		if (unknown.length > 0) {
			throw new CLIError(
				`Unrecognized key name${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
				SUPPORTED,
			);
		}

		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);

		const input = {
			terminalId: options.terminal,
			workspaceId: options.workspace,
		};
		// `writeInput` only knows sessions the host has in memory. After a host
		// restart the daemon still owns the PTY; a snapshot adopts it first, the
		// way `send` and `read` do.
		await target.client.terminal.snapshot.query({ ...input, maxLines: 1 });

		let statusCleared = false;
		for (const write of writes) {
			await target.client.terminal.writeInput.mutate({
				...input,
				data: write.data,
			});
			// Clear before any later key: an Enter that follows the interrupt
			// may start a new turn, and that turn's status must survive.
			if (write.keys.some((name) => INTERRUPT_KEYS.has(name))) {
				statusCleared =
					(await clearInterruptedAgentStatus(target.client, input)) ||
					statusCleared;
			}
			if (write.gapAfterMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, write.gapAfterMs));
			}
		}

		return {
			data: {
				terminalId: options.terminal,
				keys: names,
				writes: writes.length,
				statusCleared,
			},
			message: `Pressed ${names.join(" ")} in terminal ${options.terminal}${statusCleared ? " and cleared its interrupted agent status" : ""}`,
		};
	},
});
