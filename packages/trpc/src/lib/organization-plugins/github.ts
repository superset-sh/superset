import { installationOctokit } from "../sandbox/clone-token";

const BLOB_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;

export interface RepositorySnapshot {
	sha: string;
	paths: ReadonlySet<string>;
	read(path: string): Promise<Buffer>;
}

/** An installation token for the organization's GitHub App, scoped to the one repository. */
export async function appInstallationToken(
	installationId: string,
	repo: string,
): Promise<string> {
	const octokit = await installationOctokit(installationId);
	const { token } = (await octokit.auth({
		type: "installation",
		repositoryNames: [repo.split("/")[1] ?? repo],
	})) as { token: string };
	return token;
}

/** One commit of a repository, read with whichever token the caller chose. */
export async function repositorySnapshot(args: {
	token: string;
	repo: string;
	ref: string | null;
}): Promise<RepositorySnapshot> {
	const github = async <T>(path: string): Promise<T> => {
		const response = await fetch(
			`https://api.github.com/repos/${args.repo}${path}`,
			{
				headers: {
					accept: "application/vnd.github+json",
					authorization: `Bearer ${args.token}`,
					"x-github-api-version": "2022-11-28",
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			},
		);
		if (!response.ok) {
			throw new Error(
				`GitHub answered ${response.status} for ${args.repo}${path}`,
			);
		}
		return (await response.json()) as T;
	};

	const ref =
		args.ref ?? (await github<{ default_branch: string }>("")).default_branch;
	const { sha } = await github<{ sha: string }>(
		`/commits/${encodeURIComponent(ref)}`,
	);
	const tree = await github<{
		truncated: boolean;
		tree: { path?: string; type?: string; sha?: string }[];
	}>(`/git/trees/${sha}?recursive=1`);
	if (tree.truncated) {
		throw new Error(
			"the repository is too large for GitHub to list in one tree",
		);
	}

	const blobs = new Map<string, string>();
	for (const entry of tree.tree) {
		if (entry.type === "blob" && entry.path && entry.sha) {
			blobs.set(entry.path, entry.sha);
		}
	}

	return {
		sha,
		paths: new Set(blobs.keys()),
		async read(path) {
			const blob = blobs.get(path);
			if (!blob) throw new Error(`${path} is not in ${args.repo}@${sha}`);
			const { content } = await github<{ content: string }>(
				`/git/blobs/${blob}`,
			);
			return Buffer.from(content, "base64");
		},
	};
}

export async function readAll(
	snapshot: RepositorySnapshot,
	paths: readonly string[],
): Promise<Map<string, Buffer>> {
	const out = new Map<string, Buffer>();
	for (let i = 0; i < paths.length; i += BLOB_CONCURRENCY) {
		const batch = paths.slice(i, i + BLOB_CONCURRENCY);
		const contents = await Promise.all(batch.map((p) => snapshot.read(p)));
		batch.forEach((path, index) => {
			out.set(path, contents[index] as Buffer);
		});
	}
	return out;
}
