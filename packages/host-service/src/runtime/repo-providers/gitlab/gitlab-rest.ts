export interface GitLabRestDeps {
	host: string; // e.g. "gitlab.com" or "gl.example.com"
	token: () => Promise<string | null>;
}

export class GitLabRestError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "GitLabRestError";
	}
}

/** Encode "group/sub/project" for the :id path segment. */
export function encodeProjectPath(owner: string, name: string): string {
	return encodeURIComponent(`${owner}/${name}`);
}

export async function gitlabRest<T>(
	deps: GitLabRestDeps,
	path: string,
	params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
	const token = await deps.token();
	if (!token)
		throw new GitLabRestError(401, `No GitLab token for host ${deps.host}`);
	const url = new URL(`https://${deps.host}/api/v4${path}`);
	for (const [k, v] of Object.entries(params ?? {})) {
		if (v !== undefined) url.searchParams.set(k, String(v));
	}
	const res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	});
	if (!res.ok)
		throw new GitLabRestError(res.status, `GitLab ${res.status} for ${path}`);
	return (await res.json()) as T;
}

/**
 * Like `gitlabRest` but also returns GitLab's pagination headers.
 *
 * GitLab exposes `X-Total` (total record count) and `X-Total-Pages` on list
 * responses. We read them here so callers can compute accurate `totalCount`
 * and `hasNextPage` values instead of approximating via `items.length`.
 *
 * Reference: https://docs.gitlab.com/ce/api/rest/index.html#pagination
 */
export async function gitlabRestWithMeta<T>(
	deps: GitLabRestDeps,
	path: string,
	params?: Record<string, string | number | boolean | undefined>,
): Promise<{ data: T; total: number | null; totalPages: number | null }> {
	const token = await deps.token();
	if (!token)
		throw new GitLabRestError(401, `No GitLab token for host ${deps.host}`);
	const url = new URL(`https://${deps.host}/api/v4${path}`);
	for (const [k, v] of Object.entries(params ?? {})) {
		if (v !== undefined) url.searchParams.set(k, String(v));
	}
	const res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	});
	if (!res.ok)
		throw new GitLabRestError(res.status, `GitLab ${res.status} for ${path}`);

	const rawTotal = res.headers.get("x-total");
	const rawTotalPages = res.headers.get("x-total-pages");
	const total =
		rawTotal !== null ? Number.parseInt(rawTotal, 10) || null : null;
	const totalPages =
		rawTotalPages !== null ? Number.parseInt(rawTotalPages, 10) || null : null;

	return { data: (await res.json()) as T, total, totalPages };
}

/** POST/PUT helper for GitLab REST API write operations. */
export async function gitlabRestPost<T>(
	deps: GitLabRestDeps,
	path: string,
	body: Record<string, unknown>,
	method: "POST" | "PUT" = "PUT",
): Promise<T> {
	const token = await deps.token();
	if (!token)
		throw new GitLabRestError(401, `No GitLab token for host ${deps.host}`);
	const url = new URL(`https://${deps.host}/api/v4${path}`);
	const res = await fetch(url.toString(), {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok)
		throw new GitLabRestError(res.status, `GitLab ${res.status} for ${path}`);
	return (await res.json()) as T;
}
