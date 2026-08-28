import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceId } from "../workspaceRef";
import {
	EXTERNAL_ENTRY_PREFIX,
	externalEntryPath,
	resolveEntryPath,
} from "./entryPath";

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
		workspace: string().desc(
			"Workspace to publish into, by name or id (defaults to $SUPERSET_WORKSPACE_ID)",
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

		const entryPath =
			resolveEntryPath({
				filePath,
				workspacePath: process.env.SUPERSET_WORKSPACE_PATH,
			}) ?? externalEntryPath(filePath);

		const workspaceRef = options.workspace ?? process.env.SUPERSET_WORKSPACE_ID;
		if (!workspaceRef && !options.page) {
			throw new CLIError(
				"No workspace to publish into",
				"Run this inside a Superset workspace, pass --workspace <name|id>, or pass --page <id> to add a version to an existing page",
			);
		}
		const workspaceId = workspaceRef
			? await resolveWorkspaceId({
					value: workspaceRef,
					organizationId: ctx.config.organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				})
			: undefined;
		const link = workspaceId ? { entryPath, workspaceId } : undefined;

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

		const external =
			link && entryPath.startsWith(EXTERNAL_ENTRY_PREFIX) && !options.page
				? `\nOutside the workspace, so this page is keyed as "${entryPath}"`
				: "";

		return {
			data: page,
			message: `Published "${page.title}" v${page.version}\n${page.url}${external}`,
		};
	},
});
