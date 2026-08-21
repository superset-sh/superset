import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CLIError, number, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

export default command({
	description: "Fetch a published version back to disk",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		version: number()
			.alias("v")
			.desc("Version to fetch (defaults to the one currently served)"),
		out: string()
			.alias("o")
			.desc("Directory to write into (defaults to the current directory)"),
	},
	run: async ({ ctx, args, options }) => {
		const ref = pageRefFromArg(args.page as string);

		// `pull` takes an id, so resolve a slug through `get` first.
		const id = "id" in ref ? ref.id : (await ctx.api.page.get.query(ref)).id;

		const version = await ctx.api.page.pull.query({
			id,
			...(options.version ? { version: options.version } : {}),
		});

		const response = await fetch(version.downloadUrl);
		if (!response.ok) {
			throw new CLIError(
				`Could not download version ${version.version}`,
				`The blob store answered ${response.status}`,
			);
		}
		const bytes = Buffer.from(await response.arrayBuffer());

		const dir = resolve(process.cwd(), options.out ?? ".");
		mkdirSync(dir, { recursive: true });
		// basename() so a slug can never write outside the chosen directory.
		const target = resolve(dir, `${basename(version.slug)}.html`);
		writeFileSync(target, bytes);

		return {
			data: { ...version, path: target, sizeBytes: bytes.length },
			message: `Wrote v${version.version} of "${version.title}" to ${target}`,
		};
	},
});
