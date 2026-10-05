import type { HostServiceContext } from "../../../../types";

const MAX_LINKS = 2;
const LOOKUP_TIMEOUT_MS = 3_000;
const TITLE_MAX = 300;
const BODY_MAX = 1_200;

export interface GitHubReference {
	owner: string;
	repo: string;
	number: number;
	/** How the prompt wrote it, so the model can connect the two. */
	label: string;
}

/**
 * Issue and pull request references in a prompt: full github.com URLs, and
 * `#123` when the project has a GitHub repo to resolve it against.
 */
export function findGitHubReferences(
	prompt: string,
	repo?: { owner: string; name: string } | null,
): GitHubReference[] {
	const found = new Map<string, GitHubReference>();
	for (const match of prompt.matchAll(
		/https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:pull|issues)\/(\d+)/g,
	)) {
		const [label, owner, name, number] = match;
		if (!owner || !name || !number) continue;
		found.set(`${owner}/${name}#${number}`, {
			owner,
			repo: name,
			number: Number(number),
			label,
		});
	}
	if (repo) {
		for (const match of prompt.matchAll(/(?<![\w/])#(\d+)\b/g)) {
			const number = Number(match[1]);
			found.set(`${repo.owner}/${repo.name}#${number}`, {
				owner: repo.owner,
				repo: repo.name,
				number,
				label: match[0],
			});
		}
	}
	return [...found.values()].slice(0, MAX_LINKS);
}

/**
 * Titles and bodies of the issues and pull requests a prompt links, as
 * naming context. A lookup that fails or outlives its budget is skipped:
 * naming never waits on GitHub.
 */
export async function resolveNamingLinks(
	ctx: Pick<HostServiceContext, "github">,
	references: GitHubReference[],
	timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<string | undefined> {
	if (references.length === 0) return undefined;
	const subjects = await Promise.all(
		references.map((reference) => lookup(ctx, reference, timeoutMs)),
	);
	const lines = subjects.filter((subject) => subject !== undefined);
	console.log(
		`[naming-links] resolved ${lines.length}/${references.length}: ${references.map((reference) => reference.label).join(", ")}`,
	);
	return lines.length > 0 ? lines.join("\n\n") : undefined;
}

async function lookup(
	ctx: Pick<HostServiceContext, "github">,
	reference: GitHubReference,
	timeoutMs: number,
): Promise<string | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<undefined>((resolve) => {
		timer = setTimeout(() => resolve(undefined), timeoutMs);
	});
	const subject = ctx
		.github()
		.then((octokit) =>
			octokit.rest.issues.get({
				owner: reference.owner,
				repo: reference.repo,
				issue_number: reference.number,
			}),
		)
		.then(
			({ data }) =>
				`${reference.label}: ${data.title.slice(0, TITLE_MAX)}${
					data.body ? `\n${data.body.slice(0, BODY_MAX)}` : ""
				}`,
			(error: unknown) => {
				console.warn(
					`[naming-links] lookup failed for ${reference.label}:`,
					error,
				);
				return undefined;
			},
		);
	try {
		return await Promise.race([subject, timeout]);
	} finally {
		clearTimeout(timer);
	}
}
