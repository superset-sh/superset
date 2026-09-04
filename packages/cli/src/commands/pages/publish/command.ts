import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceId } from "../workspaceRef";
import {
	collectDirectoryPublish,
	type DirectoryAsset,
} from "./utils/collectDirectoryPublish";
import { publishResult } from "./utils/publishResult";
import { registerWatch, watchTerminalId } from "./utils/registerWatch";
import {
	EXTERNAL_ENTRY_PREFIX,
	externalEntryPath,
	resolveEntryPath,
} from "./utils/resolveEntryPath";
import { resolvePageId } from "./utils/resolvePageId";
import { uploadAssets, uploadDocument } from "./utils/upload";

const VISIBILITIES = ["just_me", "org"] as const;

export default command({
	description: "Publish an HTML file, or a directory of files, as a page",
	args: [
		positional("path")
			.required()
			.desc(
				"Path to the .html file, or a directory whose index.html is the page. Files the HTML references by relative path — images, CSS, fonts — are uploaded with it; unchanged ones are reused from the previous version",
			),
	],
	options: {
		title: string().desc("Page title (defaults to the file or directory name)"),
		description: string().desc("Short description"),
		label: string()
			.alias("l")
			.desc("What changed in this version, shown in the version history"),
		visibility: string().desc(
			`One of: ${VISIBILITIES.join(", ")} (new pages default to org)`,
		),
		page: string().desc(
			"Publish a new version of this page id, instead of resolving by workspace",
		),
		workspace: string().desc(
			"Workspace to publish into, by name or id (defaults to $SUPERSET_WORKSPACE_ID)",
		),
		noWatch: boolean().desc(
			"Do not watch this page for new comments from this session",
		),
	},
	run: async ({ ctx, args, options }) => {
		const inputPath = resolve(process.cwd(), args.path as string);
		const stat = statSync(inputPath, { throwIfNoEntry: false });
		if (!stat) {
			throw new CLIError(`No such file or directory: ${args.path}`);
		}

		let entryFilePath = inputPath;
		let assets: DirectoryAsset[] = [];
		const isDirectory = stat.isDirectory();
		if (isDirectory) {
			try {
				({ entryFilePath, assets } = collectDirectoryPublish(inputPath));
			} catch (error) {
				throw new CLIError(
					error instanceof Error ? error.message : String(error),
					"A directory publish serves index.html as the page and every other file at its relative path",
				);
			}
		} else {
			if (!stat.isFile()) {
				throw new CLIError(`No such file: ${args.path}`);
			}
			if (extname(inputPath).toLowerCase() !== ".html") {
				throw new CLIError(
					"Only .html files can be published as a page",
					"Publish a single self-contained file, or a directory whose index.html references its assets by relative path",
				);
			}
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

		const document = readFileSync(entryFilePath);
		const filename = basename(entryFilePath);

		const entryPath =
			resolveEntryPath({
				filePath: entryFilePath,
				workspacePath: process.env.SUPERSET_WORKSPACE_PATH,
			}) ??
			(isDirectory
				? `${EXTERNAL_ENTRY_PREFIX}${basename(inputPath)}/index.html`
				: externalEntryPath(entryFilePath));

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

		const title =
			options.title ??
			(isDirectory
				? basename(inputPath).replace(/[-_]+/g, " ").trim()
				: undefined);

		// First, so an oversized document is refused before anything is created
		// for it. The upload is not tied to a page; publish is what binds them.
		const { fileId } = await uploadDocument({
			api: ctx.api,
			bytes: document,
			filename,
		});

		// Assets stage against a page, so a directory publish resolves or creates
		// one before uploading. A single-file publish still lets `publish` mint it.
		const pageId =
			assets.length > 0
				? await resolvePageId({
						api: ctx.api,
						explicitPageId: options.page,
						link,
						title,
					})
				: options.page;

		const uploaded =
			assets.length > 0 && pageId
				? await uploadAssets({ api: ctx.api, assets, pageId })
				: { uploaded: 0, reused: 0, warnings: [] };

		const page = await ctx.api.page.publish.mutate({
			fileId,
			filename,
			...(pageId ? { pageId } : (link ?? {})),
			...(title ? { title } : {}),
			...(options.description ? { description: options.description } : {}),
			...(options.label ? { label: options.label } : {}),
			...(options.visibility
				? { visibility: options.visibility as (typeof VISIBILITIES)[number] }
				: {}),
		});

		const externalPath =
			link && entryPath.startsWith(EXTERNAL_ENTRY_PREFIX) && !options.page
				? entryPath
				: null;

		const terminalId = watchTerminalId();
		const organizationId = ctx.config.organizationId;
		let watching = false;
		let watchNote: string | null = null;

		if (
			!options.noWatch &&
			workspaceId !== undefined &&
			terminalId !== undefined &&
			organizationId !== undefined
		) {
			try {
				await registerWatch({
					pageId: page.id,
					slug: page.slug,
					title: page.title,
					workspaceId,
					terminalId,
					organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				});
				watching = true;
				watchNote = "Watching for comments — they will be sent to this session";
			} catch (error) {
				watchNote = `Not watching for comments: ${
					error instanceof Error ? error.message : "could not reach the host"
				}`;
			}
		}

		return publishResult({
			page,
			assets: uploaded,
			externalPath,
			watching,
			watchNote,
		});
	},
});
