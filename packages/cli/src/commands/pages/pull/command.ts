import { CLIError, number, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

const DOWNLOAD_TIMEOUT_MS = 30_000;

function downloadFailed(version: number, cause: unknown): CLIError {
	const detail =
		cause instanceof Error && cause.name === "TimeoutError"
			? `The blob store did not respond within ${DOWNLOAD_TIMEOUT_MS / 1000}s`
			: cause instanceof Error
				? cause.message
				: String(cause);
	return new CLIError(`Could not download version ${version}`, detail);
}

export default command({
	description: "Write a published version's HTML to stdout",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		version: number()
			.alias("v")
			.desc("Version to fetch (defaults to the one currently served)"),
	},
	run: async ({ ctx, args, options }) => {
		const version = await ctx.api.page.pull.query({
			...pageRefFromArg(args.page as string),
			...(options.version ? { version: options.version } : {}),
		});

		let body: ArrayBuffer;
		try {
			const response = await fetch(version.downloadUrl, {
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new CLIError(
					`Could not download version ${version.version}`,
					`The blob store answered ${response.status}`,
				);
			}
			body = await response.arrayBuffer();
		} catch (error) {
			if (error instanceof CLIError) throw error;
			throw downloadFailed(version.version, error);
		}

		process.stdout.write(Buffer.from(body));
		return undefined;
	},
});
