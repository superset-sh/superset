import type { ConvertedFile } from "../convertFiles";

interface GitHubLinkedIssue {
	slug: string;
	title: string;
	source?: "github" | "internal";
	url?: string;
	number?: number;
	state?: "open" | "closed";
}

interface IssueContent {
	number: number;
	title: string;
	body: string;
	url: string;
	state: string;
	author: string | undefined;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

function sanitizeText(str: string): string {
	return str.replace(/[&<>"']/g, (char) => {
		const entities: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return entities[char] || char;
	});
}

function sanitizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) {
			return "#invalid-url";
		}
		return url;
	} catch {
		return "#invalid-url";
	}
}

function fetchWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error("Request timeout")), timeoutMs),
		),
	]);
}

const MAX_BODY_LENGTH = 50000;
const FETCH_TIMEOUT_MS = 10000;

export async function fetchGitHubIssueFiles(
	issues: GitHubLinkedIssue[],
	projectId: string,
	queryFn: (params: {
		projectId: string;
		issueNumber: number;
	}) => Promise<IssueContent>,
): Promise<ConvertedFile[]> {
	const githubIssues = issues.filter(
		(issue): issue is typeof issue & { number: number } =>
			issue.source === "github" && typeof issue.number === "number",
	);

	if (githubIssues.length === 0) {
		return [];
	}

	const issueContents = await Promise.all(
		githubIssues.map(async (issue) => {
			try {
				const content = await fetchWithTimeout(
					queryFn({ projectId, issueNumber: issue.number }),
					FETCH_TIMEOUT_MS,
				);

				const truncatedBody =
					content.body.length > MAX_BODY_LENGTH
						? `${content.body.slice(0, MAX_BODY_LENGTH)}\n\n[... content truncated due to length ...]`
						: content.body;

				const markdown = `# GitHub Issue #${content.number}: ${sanitizeText(content.title)}

**URL:** ${sanitizeUrl(content.url)}
**State:** ${content.state}
**Author:** ${sanitizeText(content.author || "Unknown")}
**Created:** ${content.createdAt ? new Date(content.createdAt).toLocaleString() : "Unknown"}
**Updated:** ${content.updatedAt ? new Date(content.updatedAt).toLocaleString() : "Unknown"}

---

${truncatedBody}`;

				const base64 = btoa(
					encodeURIComponent(markdown).replace(/%([0-9A-F]{2})/g, (_, p1) =>
						String.fromCharCode(Number.parseInt(p1, 16)),
					),
				);

				return {
					data: `data:text/markdown;base64,${base64}`,
					mediaType: "text/markdown",
					filename: `github-issue-${content.number}.md`,
				};
			} catch (err) {
				console.warn(`Failed to fetch GitHub issue #${issue.number}:`, err);
				return null;
			}
		}),
	);

	return issueContents.filter(
		(file): file is NonNullable<typeof file> => file !== null,
	);
}
