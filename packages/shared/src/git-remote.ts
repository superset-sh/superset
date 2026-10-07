export type GitProvider = "github" | "gitlab" | "unknown";
export type RepoProvider = Exclude<GitProvider, "unknown">;

export interface ParsedRemote {
	provider: GitProvider;
	host: string;
	owner: string;
	name: string;
	url: string;
}

const KNOWN_HOSTS = new Map<string, RepoProvider>([
	["github.com", "github"],
	["gitlab.com", "gitlab"],
]);

const SCHEME_RE =
	/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^@/]+@)?(?<host>[^/:]+)(?::\d+)?\/(?<path>.+)$/;
const SCP_RE = /^(?:[^@]+@)?(?<host>[^/:]+):(?<path>.+)$/;

export function parseGitRemote(remoteUrl: string): ParsedRemote | null {
	const trimmed = remoteUrl.trim();
	const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
	const match = hasScheme ? SCHEME_RE.exec(trimmed) : SCP_RE.exec(trimmed);
	const rawHost = match?.groups?.host;
	const rawPath = match?.groups?.path;
	if (!rawHost || !rawPath) return null;

	let schemeUrl: URL | null = null;
	if (hasScheme) {
		try {
			schemeUrl = new URL(trimmed);
		} catch {
			return null;
		}
		if (schemeUrl.protocol === "file:") return null;
	}
	const hostname = (schemeUrl?.hostname ?? rawHost).toLowerCase();
	// SSH ports identify the transport, not the web/API origin.
	const host =
		schemeUrl?.protocol === "https:" || schemeUrl?.protocol === "http:"
			? schemeUrl.host.toLowerCase()
			: hostname;
	const provider = KNOWN_HOSTS.get(hostname) ?? "unknown";
	const fullPath = rawPath.replace(/[?#].*$/, "");
	if (fullPath.split("/").some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment)))
		return null;
	const path = fullPath.split("/-/")[0] ?? "";
	const segments = path
		.replace(/\/$/, "")
		.replace(/\.git$/i, "")
		.split("/")
		.filter(Boolean);
	if (segments.length < 2 || (provider === "github" && segments.length !== 2))
		return null;
	const name = segments.pop();
	const owner = segments.join("/");
	if (!name || !owner) return null;
	return {
		provider,
		host,
		owner,
		name,
		url: `https://${host}/${owner}/${name}`,
	};
}
