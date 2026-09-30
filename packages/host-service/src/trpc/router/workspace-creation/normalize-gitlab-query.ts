export type GitLabEntityKind = "issue" | "merge_request";

export interface NormalizedGitLabQuery {
	query: string;
	repoMismatch: boolean;
	isDirectLookup: boolean;
}

export function normalizeGitLabQuery(
	raw: string,
	repo: { instance: string; repoPath: string },
	kind: GitLabEntityKind,
): NormalizedGitLabQuery {
	const query = raw.trim();
	if (/^#?\d+$/.test(query)) {
		return {
			query: query.replace(/^#/, ""),
			repoMismatch: false,
			isDirectLookup: true,
		};
	}

	let url: URL;
	try {
		url = new URL(query);
	} catch {
		return { query, repoMismatch: false, isDirectLookup: false };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return { query, repoMismatch: false, isDirectLookup: false };
	}

	const match = url.pathname.match(
		/^\/(.+)\/-\/(issues|merge_requests)\/(\d+)\/?$/,
	);
	if (!match?.[1]) {
		return { query, repoMismatch: false, isDirectLookup: false };
	}
	const urlKind = match[2] === "issues" ? "issue" : "merge_request";
	if (urlKind !== kind) {
		return { query: "", repoMismatch: true, isDirectLookup: false };
	}

	let urlRepoPath: string;
	try {
		urlRepoPath = match[1]
			.split("/")
			.map((segment) => decodeURIComponent(segment))
			.join("/");
	} catch {
		return { query, repoMismatch: false, isDirectLookup: false };
	}
	const sameRepo =
		url.origin.toLowerCase() === repo.instance.toLowerCase() &&
		urlRepoPath.toLowerCase() === repo.repoPath.toLowerCase();
	return {
		query: sameRepo ? (match[3] ?? "") : "",
		repoMismatch: !sameRepo,
		isDirectLookup: sameRepo,
	};
}
