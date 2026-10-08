import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	injectStyleTag,
	PAGE_THEME_CSS,
	pageContentSecurityPolicy,
} from "@superset/shared/usercontent";
import { lookup as lookupMimeType } from "mime-types";

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
		"content-security-policy": pageContentSecurityPolicy(["*"]),
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

export function wrapperResponse(pageOrigin: string): Response {
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style></head><body><iframe src="${pageOrigin}/" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></body></html>`;
	return new Response(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; frame-src ${pageOrigin}`,
			"cache-control": "no-store",
		},
	});
}

export interface PreviewServers {
	pageUrl: string;
	wrapperUrl: string;
	missing: Set<string>;
	stop: () => void;
}

export function startPreviewServers(
	site: PreviewSite,
	port = 0,
): PreviewServers {
	const missing = new Set<string>();
	const page = Bun.serve({
		hostname: "127.0.0.1",
		port,
		fetch: (request) => {
			const { pathname } = new URL(request.url);
			const response = previewResponse(site, pathname);
			if (response.status === 404 && pathname !== "/favicon.ico") {
				missing.add(pathname);
			}
			return response;
		},
	});
	const pageOrigin = `http://127.0.0.1:${page.port}`;
	const wrapper = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => wrapperResponse(pageOrigin),
	});
	return {
		pageUrl: `${pageOrigin}/`,
		wrapperUrl: `http://127.0.0.1:${wrapper.port}/`,
		missing,
		stop: () => {
			page.stop(true);
			wrapper.stop(true);
		},
	};
}
