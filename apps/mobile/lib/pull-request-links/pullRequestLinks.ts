export interface PullRequestLink {
	owner: string;
	repo: string;
	pullNumber: number;
}

/**
 * The pull request a github.com link points at: the PR itself or any of its
 * tabs, comments and review threads (they all belong to that one PR).
 */
export function pullRequestFromUrl(url: string): PullRequestLink | null {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return null;
	}
	if (target.protocol !== "https:" || target.hostname !== "github.com") {
		return null;
	}

	const [owner, repo, kind, number] = target.pathname
		.split("/")
		.filter(Boolean);
	if (!owner || !repo || kind !== "pull" || !number || !/^\d+$/.test(number)) {
		return null;
	}
	return { owner, repo, pullNumber: Number.parseInt(number, 10) };
}

function hasControlCharacter(value: string) {
	return [...value].some(
		(character) =>
			character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
	);
}

export function gitlabPullRequestFromUrl(rawUrl: string) {
	try {
		const raw = rawUrl;
		if (!raw || /[\s\\]/.test(raw)) return null;
		const authority = /^https:\/\/([^/]+)\//.exec(raw)?.[1];
		if (!authority || /[%@?#]/.test(authority)) return null;
		const url = new URL(raw);
		if (url.protocol !== "https:" || url.hostname === "github.com") return null;
		const rawPath = raw.slice(raw.indexOf("/", 8)).split(/[?#]/, 1)[0];
		if (rawPath !== url.pathname) return null;
		const pieces = rawPath.replace(/\/$/, "").split("/").slice(1);
		if (
			pieces.length < 5 ||
			pieces.at(-3) !== "-" ||
			pieces.at(-2) !== "merge_requests"
		)
			return null;
		const number = pieces.pop();
		pieces.splice(-2);
		if (
			!number ||
			!/^[1-9]\d*$/.test(number) ||
			!Number.isSafeInteger(Number(number))
		)
			return null;
		for (const segment of pieces) {
			let shadow = segment;
			if (!shadow) return null;
			for (let round = 0; round < 8; round++) {
				if (
					shadow === "." ||
					shadow === ".." ||
					/[\\/]/.test(shadow) ||
					hasControlCharacter(shadow)
				)
					return null;
				let decoded: string;
				try {
					decoded = decodeURIComponent(shadow);
				} catch {
					if (round === 0) return null;
					break;
				}
				if (decoded === shadow) break;
				shadow = decoded;
				if (round === 7) return null;
			}
		}
		const encodedPath = pieces.join("/");
		const decoded = pieces.map((segment) => decodeURIComponent(segment));
		const repo = decoded.pop();
		const owner = decoded.join("/");
		if (!repo || !owner) return null;
		return {
			provider: "gitlab" as const,
			host: url.host,
			owner,
			repo,
			pullNumber: Number(number),
			expectedUrl: `https://${url.host}/${encodedPath}/-/merge_requests/${number}`,
		};
	} catch {
		return null;
	}
}
