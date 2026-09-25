import { positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

export default command({
	description: "List a page's versions, newest first",
	args: [positional("page").required().desc("Page id or slug")],
	run: async ({ ctx, args }) =>
		await ctx.api.page.versions.query(pageRefFromArg(args.page as string)),
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				version: row.version,
				label: row.label,
				size: `${Math.max(1, Math.round((row.sizeBytes as number) / 1024))} KB`,
				published: new Date(row.createdAt as string).toLocaleString(),
			})),
			["version", "label", "size", "published"],
			["V", "LABEL", "SIZE", "PUBLISHED"],
			[4, 32, 10, 24],
		),
});
