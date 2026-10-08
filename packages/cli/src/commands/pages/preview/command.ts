import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { CLIError, number, positional } from "@superset/cli-framework";
import {
	injectStyleTag,
	PAGE_THEME_CSS,
	pageContentSecurityPolicy,
} from "@superset/shared/usercontent";
import { lookup as lookupMimeType } from "mime-types";
import { command } from "../../../lib/command";

export interface PreviewSite {
	root: string;
	entry: string;
}

export function resolvePreviewSite(inputPath: string): PreviewSite {
	const stat = statSync(inputPath, { throwIfNoEntry: false });
	if (!stat) throw new CLIError(`No such file or directory: ${inputPath}`);
	if (stat.isDirectory()) {
		const entry = join(inputPath, "index.html");
		if (!statSync(entry, { throwIfNoEntry: false })?.isFile()) {
			throw new CLIError(`No index.html in ${inputPath}`);
		}
		return { root: inputPath, entry };
	}
	if (extname(inputPath).toLowerCase() !== ".html") {
		throw new CLIError("Only .html files can be previewed as a page");
	}
	return { root: dirname(inputPath), entry: inputPath };
}

export function previewResponse(site: PreviewSite, pathname: string): Response {
	const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
	const file = relative ? resolve(site.root, relative) : site.entry;
	const inside = file === site.root || file.startsWith(site.root + sep);
	if (!inside || relative.startsWith("_superset/")) {
		return new Response("Not found", { status: 404 });
	}
	if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
		return new Response("Not found", { status: 404 });
	}

	const type = lookupMimeType(file) || "application/octet-stream";
	const headers = {
		"content-type": type,
		"content-security-policy": pageContentSecurityPolicy(["'none'"]),
		"cache-control": "no-store",
	};
	if (type === "text/html") {
		const html = injectStyleTag(readFileSync(file, "utf-8"), PAGE_THEME_CSS);
		return new Response(html, {
			headers: { ...headers, "content-type": "text/html; charset=utf-8" },
		});
	}
	return new Response(readFileSync(file), { headers });
}

export default command({
	description:
		"Serve a page locally with the theme and content policy it gets once published",
	args: [
		positional("path")
			.required()
			.desc(
				"Path to the .html file, or a directory whose index.html is the page",
			),
	],
	options: {
		port: number().desc("Port to listen on (defaults to a free one)"),
	},
	skipMiddleware: true,
	run: async ({ args, options, signal }) => {
		const site = resolvePreviewSite(
			resolve(process.cwd(), args.path as string),
		);
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: options.port ?? 0,
			fetch: (request) => previewResponse(site, new URL(request.url).pathname),
		});
		process.stdout.write(
			`Previewing ${site.entry} at http://127.0.0.1:${server.port}/\nEdits show on reload. Stop with Ctrl-C.\n`,
		);
		await new Promise((stopped) =>
			signal.addEventListener("abort", stopped, { once: true }),
		);
		server.stop(true);
		return undefined;
	},
});
