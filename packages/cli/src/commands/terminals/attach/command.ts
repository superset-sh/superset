import { boolean, CLIError, string } from "@superset/cli-framework";
import { clearAgentStatusAfterInterrupt } from "../../../lib/agent-binding";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	attachTerminal,
	DETACH_KEY_LABEL,
	interruptIn,
	terminalAttachUrl,
} from "../../../lib/terminal-attach";

const SSH_CONNECTION_FAILED = 255;
const COMMAND_NOT_FOUND = 127;

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export default command({
	description: `Attach this shell to a running terminal; detach with ${DETACH_KEY_LABEL}`,
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to attach to"),
		ssh: string().desc(
			"Attach through SSH on this target (user@machine); runs `superset terminals attach --local` there",
		),
	},
	run: async ({ ctx, options, signal }) => {
		if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
			throw new CLIError(
				"attach needs an interactive terminal",
				"Scripts can use `superset terminals read` and `terminals send` instead",
			);
		}

		if (options.ssh) {
			if (options.host || options.local) {
				throw new CLIError("--ssh cannot be combined with --host or --local");
			}
			const remote = [
				"superset",
				"terminals",
				"attach",
				"--local",
				"--workspace",
				options.workspace,
				"--terminal",
				options.terminal,
			]
				.map(shellQuote)
				.join(" ");
			const child = Bun.spawn(["ssh", "-t", options.ssh, remote], {
				stdio: ["inherit", "inherit", "inherit"],
			});
			const exitCode = await child.exited;
			if (exitCode === SSH_CONNECTION_FAILED) {
				throw new CLIError(
					`Could not connect to ${options.ssh} over SSH`,
					`Check access first with: ssh ${options.ssh}`,
				);
			}
			if (exitCode === COMMAND_NOT_FOUND) {
				throw new CLIError(
					`\`superset\` is not installed on ${options.ssh}`,
					"Install the CLI there and run `superset auth login`",
				);
			}
			if (exitCode !== 0) {
				throw new CLIError(
					`Attach on ${options.ssh} failed (exit ${exitCode})`,
					"See the error printed above by the remote CLI",
				);
			}
			return {
				data: { terminalId: options.terminal, ssh: options.ssh },
				message: `Back from ${options.ssh}; the terminal keeps running there`,
			};
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
		const ref = {
			workspaceId: options.workspace,
			terminalId: options.terminal,
		};

		process.stderr.write(
			`Attaching to terminal ${options.terminal}. Detach with ${DETACH_KEY_LABEL}.\n`,
		);
		const end = await attachTerminal({
			url: terminalAttachUrl(target.ws, options.workspace, options.terminal),
			onInput: (chunk) => {
				const interrupt = interruptIn(chunk);
				if (!interrupt) return;
				clearAgentStatusAfterInterrupt(target.client, ref, [interrupt]).catch(
					() => {},
				);
			},
			signal,
		});

		switch (end.reason) {
			case "error":
				throw new CLIError(
					`Terminal ${options.terminal}: ${end.message}`,
					"List live terminals with `superset terminals list`",
				);
			case "exited":
				return {
					data: { terminalId: options.terminal, ...end },
					message: `Terminal ${options.terminal} exited with code ${end.exitCode}`,
				};
			case "closed":
				throw new CLIError(
					`Connection to terminal ${options.terminal} closed unexpectedly`,
					"The terminal keeps running; attach again",
				);
			case "detached":
				return {
					data: { terminalId: options.terminal, ...end },
					message: `Detached from terminal ${options.terminal}`,
				};
		}
	},
});
