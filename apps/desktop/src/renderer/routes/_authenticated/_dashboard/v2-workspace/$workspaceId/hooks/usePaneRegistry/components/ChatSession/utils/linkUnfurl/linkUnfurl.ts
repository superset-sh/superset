import { parseSupersetAppLink } from "../supersetAppLink";

export type LinkUnfurl = {
	icon: { kind: "plugin"; name: string } | { kind: "file"; fileName: string };
	label?: string;
};

type LinkTarget = { href: string; url: URL | null; isLocalPath: boolean };

type LinkUnfurler = (target: LinkTarget, webUrl: string) => LinkUnfurl | null;

const SERVICE_HOSTS: [RegExp, string][] = [
	[/^mail\.google\.com$/, "gmail"],
	[/^calendar\.google\.com$/, "google-calendar"],
	[/^(www\.)?linear\.app$/, "linear"],
	[/^(www\.|gist\.)?github\.com$/, "github"],
	[/(^|\.)slack\.com$/, "slack"],
	[/(^|\.)notion\.(so|site)$/, "notion"],
	[/(^|\.)sentry\.io$/, "sentry"],
	[/(^|\.)posthog\.com$/, "posthog"],
	[/(^|\.)vercel\.com$/, "vercel"],
	[/(^|\.)figma\.com$/, "figma"],
	[/(^|\.)stripe\.com$/, "stripe"],
	[/(^|\.)neon\.(tech|com)$/, "neon"],
	[/(^|\.)ynab\.com$/, "ynab"],
	[/(^|\.)granola\.(ai|so)$/, "granola"],
	[/(^|\.)superhuman\.com$/, "superhuman"],
	[/(^|\.)circleback\.ai$/, "circleback"],
	[/(^|\.)supabase\.(com|co)$/, "supabase"],
];

const FILE_EXTENSION = /\.([a-z0-9]{1,8})$/i;
const WEB_PAGE_EXTENSIONS = new Set([
	"html",
	"htm",
	"php",
	"asp",
	"aspx",
	"jsp",
]);

function decodePath(path: string): string {
	try {
		return decodeURI(path);
	} catch {
		return path;
	}
}

function lastSegment(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? "";
}

const supersetApp: LinkUnfurler = ({ href }, webUrl) => {
	const link = parseSupersetAppLink(href, webUrl);
	if (!link) return null;
	const icon = { kind: "plugin", name: "superset" } as const;
	switch (link.kind) {
		case "page":
			return { icon, label: link.slug };
		case "task":
			return { icon, label: link.taskId };
		case "plugin":
			return { icon: { kind: "plugin", name: link.pluginName } };
		default:
			return { icon };
	}
};

const googleDocs: LinkUnfurler = ({ url }) => {
	if (url?.hostname !== "docs.google.com") return null;
	if (url.pathname.startsWith("/spreadsheets/")) {
		return { icon: { kind: "plugin", name: "google-sheets" } };
	}
	return { icon: { kind: "plugin", name: "google-docs" } };
};

const githubReference: LinkUnfurler = ({ url }) => {
	if (url?.hostname !== "github.com") return null;
	const match = url.pathname.match(
		/^\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)\/?$/,
	);
	if (!match) return null;
	return {
		icon: { kind: "plugin", name: "github" },
		label: `${match[1]}/${match[2]}#${match[3]}`,
	};
};

const linearIssue: LinkUnfurler = ({ url }) => {
	if (url?.hostname !== "linear.app") return null;
	const identifier = url.pathname.match(
		/^\/[^/]+\/issue\/([A-Z0-9]+-\d+)/,
	)?.[1];
	if (!identifier) return null;
	return { icon: { kind: "plugin", name: "linear" }, label: identifier };
};

const service: LinkUnfurler = ({ url }) => {
	if (!url) return null;
	const entry = SERVICE_HOSTS.find(([host]) => host.test(url.hostname));
	return entry ? { icon: { kind: "plugin", name: entry[1] } } : null;
};

const file: LinkUnfurler = ({ href, url, isLocalPath }) => {
	const path = isLocalPath ? href : url ? url.pathname : null;
	if (!path) return null;
	const fileName = lastSegment(isLocalPath ? path : decodePath(path));
	const extension = fileName.match(FILE_EXTENSION)?.[1]?.toLowerCase();
	if (!extension || (!isLocalPath && WEB_PAGE_EXTENSIONS.has(extension))) {
		return null;
	}
	return { icon: { kind: "file", fileName }, label: fileName };
};

const UNFURLERS: LinkUnfurler[] = [
	supersetApp,
	githubReference,
	linearIssue,
	googleDocs,
	service,
	file,
];

export function unfurlLink(
	href: string,
	isLocalPath: boolean,
	webUrl: string,
): LinkUnfurl | null {
	let url: URL | null = null;
	if (!isLocalPath) {
		try {
			url = new URL(href);
		} catch {}
		if (url && url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
	}
	const target = { href, url, isLocalPath };
	for (const unfurler of UNFURLERS) {
		const unfurl = unfurler(target, webUrl);
		if (unfurl) return unfurl;
	}
	return null;
}
