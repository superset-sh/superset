import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { collectAssetReferences, rewriteAssetReferences } from "./assets";
import { resolveEntryPath } from "./entryPath";
import { uploadAssets } from "./uploadAssets";

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
				"Images and other media upload as assets referenced from the HTML",
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

		// Assets first: the HTML cannot be finalised until their URLs exist, and
		// they cannot be attached until the version does. Files are parentless
		// precisely so this ordering works.
		const assets = collectAssetReferences(html, filePath);
		const uploaded = await uploadAssets(ctx.api, assets);
		const finalHtml = uploaded.length
			? rewriteAssetReferences(
					html,
					filePath,
					new Map(uploaded.map((asset) => [asset.reference, asset.url])),
				)
			: html;

		const entryPath = resolveEntryPath({
			filePath,
			workspacePath: process.env.SUPERSET_WORKSPACE_PATH,
		});
		const workspaceId = entryPath
			? process.env.SUPERSET_WORKSPACE_ID
			: undefined;

		const page = await ctx.api.page.publish.mutate({
			content: Buffer.from(finalHtml, "utf8").toString("base64"),
			contentType: "text/html",
			filename: basename(filePath),
			...(entryPath && workspaceId ? { entryPath, workspaceId } : {}),
			...(options.page ? { pageId: options.page } : {}),
			...(options.title ? { title: options.title } : {}),
			...(options.description ? { description: options.description } : {}),
			...(options.label ? { label: options.label } : {}),
			...(options.visibility
				? { visibility: options.visibility as (typeof VISIBILITIES)[number] }
				: {}),
			fileIds: uploaded.map((asset) => asset.fileId),
		});

		const assetLine = uploaded.length
			? `\n${uploaded.length} asset${uploaded.length === 1 ? "" : "s"}${
					uploaded.some((asset) => asset.reused)
						? ` (${uploaded.filter((a) => a.reused).length} already uploaded)`
						: ""
				}`
			: "";
		const unlinked =
			entryPath || options.page
				? ""
				: "\nNot linked to a workspace — republish with --page to add a version";

		return {
			data: { ...page, assets: uploaded },
			message: `Published "${page.title}" v${page.version}\n${page.url}${assetLine}${unlinked}`,
		};
	},
});
