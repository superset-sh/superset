import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHost } from "../../../lib/host/resolve";
import { resolveOrganizationFromContext } from "../../../lib/resolve-org";

/**
 * Run a command locally in a shell, streaming its output. Resolves the exit
 * code, or rejects if the process was killed by a signal (e.g. SIGTERM from an
 * abort) — a killed process is not a successful wake.
 */
function runLocally(cmd: string, signal: AbortSignal): Promise<number> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new CLIError("Cancelled before wake command started"));
			return;
		}
		const child = spawn(cmd, { shell: true, stdio: "inherit" });
		const onAbort = () => child.kill("SIGTERM");
		signal.addEventListener("abort", onAbort, { once: true });
		child.on("error", reject);
		child.on("close", (code, sig) => {
			signal.removeEventListener("abort", onAbort);
			if (code === null) {
				reject(new CLIError(`Wake command terminated by ${sig ?? "signal"}`));
				return;
			}
			resolve(code);
		});
	});
}

export default command({
	description: "Wake a host by running its configured wake command locally",
	args: [positional("host").required().desc("Host name or id")],
	options: {
		yes: boolean().desc("Skip the confirmation prompt"),
		org: string().desc("Organization (id, slug, or name); defaults to active"),
	},
	run: async ({ ctx, args, options, signal }) => {
		const { id: organizationId } = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);

		const host = await resolveHost(
			ctx.api,
			organizationId,
			args.host as string,
		);
		if (!host.wakeCommand) {
			throw new CLIError(
				`No wake command set for ${host.name}`,
				`Set one: superset hosts set-wake ${host.name} "<command>"`,
			);
		}

		p.log.info(`Wake command: ${host.wakeCommand}`);
		if (!options.yes) {
			const confirmed = await p.confirm({
				message: `Run this locally to wake ${host.name}?`,
			});
			if (p.isCancel(confirmed) || !confirmed) {
				return { data: { cancelled: true }, message: "Cancelled" };
			}
		}

		const code = await runLocally(host.wakeCommand, signal);
		if (code !== 0) {
			throw new CLIError(`Wake command exited with code ${code}`);
		}
		return {
			data: { host: host.name, exitCode: code },
			message: `Ran wake command for ${host.name}`,
		};
	},
});
