import type {
	GitLabIssueReference,
	LinkedIssue,
} from "renderer/stores/new-workspace-draft";

export interface GitLabIssuePromptTarget {
	organizationId: string;
	projectId: string;
	hostId: string;
	hostUrl: string;
}

export function parseGitLabIssueUrl(raw: string) {
	try {
		if (/[\s\\?#]/.test(raw)) return null;
		const authority = /^https:\/\/([^/]+)\//.exec(raw)?.[1];
		if (!authority || /[%@?#]/.test(authority)) return null;
		const url = new URL(raw);
		const path = raw.slice(raw.indexOf("/", 8));
		if (url.protocol !== "https:" || path !== url.pathname) return null;
		const segments = path.split("/").slice(1);
		if (
			segments.length < 5 ||
			segments.at(-3) !== "-" ||
			segments.at(-2) !== "issues"
		)
			return null;
		const iid = segments.pop();
		segments.splice(-2);
		if (!iid || !/^[1-9]\d*$/.test(iid) || !Number.isSafeInteger(Number(iid)))
			return null;
		const decoded = segments.map((segment) => {
			let shadow = segment;
			if (!shadow) throw Error("Invalid segment");
			for (let round = 0; round < 8; round++) {
				if (
					shadow === "." ||
					shadow === ".." ||
					/[\\/]/.test(shadow) ||
					Array.from(shadow).some(
						(character) =>
							character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
					)
				)
					throw Error("Invalid segment");
				let next: string;
				try {
					next = decodeURIComponent(shadow);
				} catch {
					if (round === 0) throw Error("Invalid encoding");
					break;
				}
				if (next === shadow) break;
				shadow = next;
				if (round === 7) throw Error("Invalid encoding");
			}
			return decodeURIComponent(segment);
		});
		const repo = decoded.pop();
		if (!repo) return null;
		return {
			host: url.host,
			owner: decoded.join("/"),
			repo,
			issueNumber: Number(iid),
			expectedIssueUrl: `https://${url.host}${url.pathname}`,
		};
	} catch {
		return null;
	}
}

export function linkedIssueFromGitLab(input: {
	projectId: string;
	hostId: string;
	hostUrl: string;
	issueNumber: number;
	title: string;
	url: string;
	state: string;
}): LinkedIssue | null {
	const identity = parseGitLabIssueUrl(input.url);
	if (
		!identity ||
		identity.issueNumber !== input.issueNumber ||
		!input.projectId ||
		!input.hostId ||
		!input.hostUrl
	)
		return null;
	const gitlab: GitLabIssueReference = {
		...identity,
		projectId: input.projectId,
		hostId: input.hostId,
		hostUrl: input.hostUrl,
	};
	return {
		source: "gitlab",
		slug: `gitlab:${JSON.stringify([input.hostId, input.projectId, identity.expectedIssueUrl])}`,
		title: input.title,
		number: input.issueNumber,
		url: identity.expectedIssueUrl,
		state: input.state === "closed" ? "closed" : "open",
		gitlab,
	};
}

export function gitLabIssuePromptKey(
	issue: LinkedIssue,
	target?: GitLabIssuePromptTarget,
): string | null {
	const ref = issue.gitlab;
	if (
		issue.source !== "gitlab" ||
		!ref ||
		!target ||
		!target.organizationId ||
		!target.hostUrl ||
		ref.projectId !== target.projectId ||
		ref.hostId !== target.hostId ||
		issue.number !== ref.issueNumber ||
		issue.url !== ref.expectedIssueUrl
	)
		return null;
	const parsed = parseGitLabIssueUrl(ref.expectedIssueUrl);
	if (
		!parsed ||
		parsed.host !== ref.host ||
		parsed.owner !== ref.owner ||
		parsed.repo !== ref.repo ||
		parsed.issueNumber !== ref.issueNumber ||
		parsed.expectedIssueUrl !== ref.expectedIssueUrl
	)
		return null;
	return `gitlab-issue:${JSON.stringify([target.organizationId, target.hostId, target.hostUrl, target.projectId, ref.expectedIssueUrl])}`;
}
