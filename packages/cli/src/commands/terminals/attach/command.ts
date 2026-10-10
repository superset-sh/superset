import { boolean, CLIError, string } from "@superset/cli-framework";
import { clearAgentStatusAfterInterrupt } from "../../../lib/agent-binding";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	attachTerminal,
	DETACH_KEY_LABEL,
	terminalAttachUrl,
} from "../../../lib/terminal-attach";
import { INTERRUPT_KEYS } from "../../../lib/terminal-keys";

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
	run: async ({ ctx, options }) => {
		if (!process.stdin.isTTY || !process.stdout.isTTY) {
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
			if (exitCode !== 0) {
				throw new CLIError(
					`ssh exited with code ${exitCode}`,
					`Check that \`superset\` is installed and signed in on ${options.ssh}`,
				);
			}
			return { data: { terminalId: options.terminal }, message: "" };
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
				if (!INTERRUPT_KEYS.has(chunk)) return;
				clearAgentStatusAfterInterrupt(target.client, ref, [chunk]).catch(
					() => {},
				);
			},
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
			default:
				return {
					data: { terminalId: options.terminal, ...end },
					message:
						end.reason === "detached"
							? `Detached from terminal ${options.terminal}`
							: `Connection to terminal ${options.terminal} closed`,
				};
		}
	},
});
