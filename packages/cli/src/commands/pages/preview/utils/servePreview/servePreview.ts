import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	FILE_CONTENT_SECURITY_POLICY,
	injectStyleTag,
	PAGE_THEME_CSS,
	pageAssetResponsePolicy,
	pageContentSecurityPolicy,
} from "@superset/shared/usercontent";
import { lookup as lookupMimeType } from "mime-types";

export interface PreviewSite {
	root: string;
	entry: string;
	assets: boolean;
}

export function resolvePreviewSite(inputPath: string): PreviewSite {
	const stat = statSync(inputPath, { throwIfNoEntry: false });
	if (!stat) throw new CLIError(`No such file or directory: ${inputPath}`);
	if (stat.isDirectory()) {
		const entry = join(inputPath, "index.html");
		if (!statSync(entry, { throwIfNoEntry: false })?.isFile()) {
			throw new CLIError(`No index.html in ${inputPath}`);
		}
		return {
			root: realpathSync(inputPath),
			entry: realpathSync(entry),
			assets: true,
		};
	}
	if (extname(inputPath).toLowerCase() !== ".html") {
		throw new CLIError("Only .html files can be previewed as a page");
	}
	const entry = realpathSync(inputPath);
	return { root: dirname(entry), entry, assets: false };
}

function notFound(): Response {
	return new Response("Not found", { status: 404 });
}

function resolveRequest(site: PreviewSite, pathname: string): string | null {
	let relative: string;
	try {
		relative = decodeURIComponent(pathname).replace(/^\/+/, "");
	} catch {
		return null;
	}
	if (!relative || relative === basename(site.entry)) return site.entry;
	if (!site.assets || relative.startsWith("_superset/")) return null;
	let file: string;
	try {
		file = realpathSync(resolve(site.root, relative));
	} catch {
		return null;
	}
	if (!file.startsWith(site.root + sep)) return null;
	return statSync(file).isFile() ? file : null;
}

export function previewResponse(
	site: PreviewSite,
	pathname: string,
	fetchDest?: string,
): Response {
	const file = resolveRequest(site, pathname);
	if (!file) return notFound();

	const type = lookupMimeType(file) || "application/octet-stream";
	if (type === "text/html") {
		const html = injectStyleTag(readFileSync(file, "utf-8"), PAGE_THEME_CSS);
		return new Response(html, {
			headers: {
				"content-type": "text/html; charset=utf-8",
				"content-security-policy": pageContentSecurityPolicy(["*"]),
				"cache-control": "no-store",
			},
		});
	}
	const policy = pageAssetResponsePolicy({ contentType: type, fetchDest });
	const headers: Record<string, string> = {
		"content-type": policy.contentType,
		"content-security-policy": FILE_CONTENT_SECURITY_POLICY,
		"x-content-type-options": "nosniff",
		"cache-control": "no-store",
	};
	if (policy.disposition === "attachment") {
		headers["content-disposition"] = `attachment; filename="${basename(file)}"`;
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
			const response = previewResponse(
				site,
				pathname,
				request.headers.get("sec-fetch-dest") ?? undefined,
			);
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
