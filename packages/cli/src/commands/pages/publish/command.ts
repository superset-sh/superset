import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEntryPath } from "./entryPath";

const VISIBILITIES = ["just_me", "org"] as const;

export default command({
	description: "Publish an HTML file as a page",
	args: [positional("path").required().desc("Path to the .html file")],
	options: {
		title: string().desc("Page title (defaults to the filename)"),
		description: string().desc("Short description"),
		label: string()
			.alias("l")
			.desc("What changed in this version, shown in the version history"),
		visibility: string().desc(`One of: ${VISIBILITIES.join(", ")}`),
		page: string().desc(
			"Publish a new version of this page id, instead of resolving by workspace",
		),
	},
	run: async ({ ctx, args, options }) => {
		const filePath = resolve(process.cwd(), args.path as string);

		if (!existsSync(filePath) || !statSync(filePath).isFile()) {
			throw new CLIError(`No such file: ${args.path}`);
		}
		if (extname(filePath).toLowerCase() !== ".html") {
			throw new CLIError(
				"Only .html files can be published as a page",
				"A page is one self-contained file: inline your CSS and JS, and embed images as data: URIs",
			);
		}
		if (
			options.visibility &&
			!VISIBILITIES.includes(options.visibility as never)
		) {
			throw new CLIError(
				`Invalid visibility: ${options.visibility}`,
				`Use one of: ${VISIBILITIES.join(", ")}`,
			);
		}

		const html = readFileSync(filePath, "utf8");

		const entryPath = resolveEntryPath({
			filePath,
			workspacePath: process.env.SUPERSET_WORKSPACE_PATH,
		});
		const workspaceId = entryPath
			? process.env.SUPERSET_WORKSPACE_ID
			: undefined;
		const link =
			entryPath && workspaceId ? { entryPath, workspaceId } : undefined;

		const page = await ctx.api.page.publish.mutate({
			content: Buffer.from(html, "utf8").toString("base64"),
			contentType: "text/html",
			filename: basename(filePath),
			...(link ?? {}),
			...(options.page ? { pageId: options.page } : {}),
			...(options.title ? { title: options.title } : {}),
			...(options.description ? { description: options.description } : {}),
			...(options.label ? { label: options.label } : {}),
			...(options.visibility
				? { visibility: options.visibility as (typeof VISIBILITIES)[number] }
				: {}),
		});

		const unlinked =
			link || options.page
				? ""
				: "\nNot linked to a workspace; republish with --page to add a version";

		return {
			data: page,
			message: `Published "${page.title}" v${page.version}\n${page.url}${unlinked}`,
		};
	},
});
