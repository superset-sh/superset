import * as p from "@clack/prompts";
import { CLIError, positional } from "@superset/cli-framework";
import { Sandbox } from "@vercel/sandbox";
import { command } from "../../../lib/command";

// Keep the sandbox alive up to the plan's max session duration (Pro: 24h).
const EXTEND_MS = 24 * 60 * 60 * 1000;

export default command({
	description: "Start (resume) a remote host running in a Vercel sandbox",
	args: [
		positional("name")
			.required()
			.desc("Vercel sandbox name (see: vercel sandbox ls)"),
	],
	run: async ({ args }) => {
		const name = args.name as string;

		p.intro(`superset hosts start (${name})`);
		const spinner = p.spinner();
		spinner.start("Resuming sandbox and starting host service...");

		try {
			// Resumes the persisted sandbox by name (auto-resumes on the first call).
			const sandbox = await Sandbox.get({ name });
			// Restart host-service; it re-registers with the relay. Idempotent if
			// it is already running inside the sandbox.
			await sandbox.runCommand({
				cmd: "superset",
				args: ["start", "--daemon"],
				detached: true,
			});
			await sandbox.extendTimeout(EXTEND_MS);

			spinner.stop(`Sandbox "${name}" is running.`);
			p.log.info(
				"Host service is connecting — it will show ONLINE in `superset hosts list` shortly.",
			);
			p.outro("Done.");

			return {
				data: { name, status: "running" },
				message: `Started sandbox ${name}`,
			};
		} catch (error) {
			spinner.stop("Failed to start sandbox");
			const message = error instanceof Error ? error.message : "Unknown error";
			if (/oidc|token|credential|unauthor|forbidden/i.test(message)) {
				throw new CLIError(
					"Vercel authentication required",
					"Run `vercel link` then `vercel env pull`, or set VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID.",
				);
			}
			if (/not found|no sandbox|does not exist/i.test(message)) {
				throw new CLIError(
					`No Vercel sandbox named "${name}"`,
					"Check the name with `vercel sandbox ls`.",
				);
			}
			throw new CLIError(message);
		}
	},
});
