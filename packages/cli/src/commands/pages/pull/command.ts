import { CLIError, number, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

const DOWNLOAD_TIMEOUT_MS = 30_000;

export default command({
	description: "Write a published version's HTML to stdout",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		version: number()
			.alias("v")
			.desc("Version to fetch (defaults to the one currently served)"),
	},
	// stdout rather than an --out dir: the published bytes are not the source
	// file (assets were rewritten to blob URLs), and where a copy lands is the
	// caller's business.
	run: async ({ ctx, args, options }) => {
		const ref = pageRefFromArg(args.page as string);

		// `pull` takes an id, so resolve a slug through `get` first.
		const id = "id" in ref ? ref.id : (await ctx.api.page.get.query(ref)).id;

		const version = await ctx.api.page.pull.query({
			id,
			...(options.version ? { version: options.version } : {}),
		});

		let response: Response;
		try {
			response = await fetch(version.downloadUrl, {
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			});
		} catch (error) {
			throw new CLIError(
				`Could not download version ${version.version}`,
				error instanceof Error && error.name === "TimeoutError"
					? `The blob store did not respond within ${DOWNLOAD_TIMEOUT_MS / 1000}s`
					: error instanceof Error
						? error.message
						: String(error),
			);
		}

		if (!response.ok) {
			throw new CLIError(
				`Could not download version ${version.version}`,
				`The blob store answered ${response.status}`,
			);
		}

		process.stdout.write(Buffer.from(await response.arrayBuffer()));

		// Nothing returned: a summary would corrupt redirected output.
		return undefined;
	},
});
