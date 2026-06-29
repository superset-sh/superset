export type GitProvider = "github" | "gitlab" | "unknown";

export interface ParsedRemote {
	/** Resolved for known SaaS hosts; "unknown" for self-managed (resolved elsewhere). */
	provider: GitProvider;
	/** Lowercased host, port stripped. */
	host: string;
	/** Namespace path. May contain "/" for GitLab nested subgroups. */
	owner: string;
	/** Repository name, ".git" stripped. */
	name: string;
	/** Canonical https URL. */
	url: string;
}

const KNOWN_HOSTS: Record<string, GitProvider> = {
	"github.com": "github",
	"gitlab.com": "gitlab",
};

// scheme://[user@]host[:port]/path  — covers https, http, ssh, git
const SCHEME_RE =
	/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^@/]+@)?(?<host>[^/:]+)(?::\d+)?\/(?<path>.+)$/;
// SCP-style: [user@]host:path  — no scheme, colon separates host from path.
// Windows absolute paths (`C:\...`) also match here but fall through to `null`:
// their backslash path never yields two slash-separated segments.
const SCP_RE = /^(?:[^@]+@)?(?<host>[^/:]+):(?<path>.+)$/;

export function parseGitRemote(remoteUrl: string): ParsedRemote | null {
	const trimmed = remoteUrl.trim();
	if (!trimmed) return null;

	const match = SCHEME_RE.exec(trimmed) ?? SCP_RE.exec(trimmed);
	const host = match?.groups?.host;
	const rawPath = match?.groups?.path;
	if (!host || !rawPath) return null;

	const normalizedHost = host.toLowerCase();
	const provider = KNOWN_HOSTS[normalizedHost] ?? "unknown";

	let cleanedPath = rawPath
		.replace(/[?#].*$/, "") // drop query string / fragment
		.replace(/^\//, "") // leading slash from scp `:/group/...`
		.replace(/\/$/, ""); // trailing slash

	// GitLab web URLs separate the project path from sub-resources with `/-/`
	// (e.g. `group/proj/-/merge_requests/1`). Keep only the project path. Done
	// before the `.git` strip so a `…/widget.git/-/…` form still yields `widget`.
	const dashIdx = cleanedPath.indexOf("/-/");
	if (dashIdx !== -1) cleanedPath = cleanedPath.slice(0, dashIdx);

	cleanedPath = cleanedPath.replace(/\.git$/i, ""); // .git suffix (case-insensitive)

	const segments = cleanedPath.split("/").filter(Boolean);
	if (segments.length < 2) return null;

	// GitHub has no subgroups: a valid remote path is exactly owner/name. Extra
	// segments mean this is a web URL (/tree, /blob, /pull), not a remote —
	// reject rather than return a wrong owner/name.
	if (provider === "github" && segments.length !== 2) return null;

	const name = segments[segments.length - 1];
	const owner = segments.slice(0, -1).join("/");
	// `name`/`owner` are `string | undefined` under noUncheckedIndexedAccess; the
	// length check guarantees presence and this guard satisfies the type checker.
	if (!owner || !name) return null;

	return {
		provider,
		host: normalizedHost,
		owner,
		name,
		url: `https://${normalizedHost}/${owner}/${name}`,
	};
}
