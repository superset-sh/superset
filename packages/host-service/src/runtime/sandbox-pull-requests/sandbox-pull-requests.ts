const POLL_MS = 30_000;
const MAX_FAILURE_WAIT_MS = 5 * 60 * 1000;

interface LinkedPullRequest {
	repository: string;
	number: number;
}

const keyOf = (pullRequest: LinkedPullRequest) =>
	`${pullRequest.repository.toLowerCase()}#${pullRequest.number}`;

/**
 * Sends the API each PR this box links, once. The PR runtime already keeps
 * the history; this only reads it, so a closed box's list still shows its PRs.
 */
export function startSandboxPullRequestReporter(args: {
	apiUrl: string;
	workspaceId: string;
	hostSecret: string;
	read: () => Promise<LinkedPullRequest[]>;
}): () => void {
	const sent = new Set<string>();
	let waitMs = POLL_MS;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	const report = async () => {
		const unsent = (await args.read()).filter((pr) => !sent.has(keyOf(pr)));
		if (unsent.length === 0) return;
		const response = await fetch(
			`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/pull-requests`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.hostSecret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ pullRequests: unsent.slice(0, 200) }),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) throw new Error(`answered ${response.status}`);
		for (const pullRequest of unsent.slice(0, 200))
			sent.add(keyOf(pullRequest));
	};

	const run = async () => {
		timer = null;
		try {
			await report();
			waitMs = POLL_MS;
		} catch (error) {
			console.warn(
				"[sandbox-pull-requests] report failed:",
				error instanceof Error ? error.message : error,
			);
			waitMs = Math.min(waitMs * 2, MAX_FAILURE_WAIT_MS);
		}
		if (!stopped) timer = setTimeout(() => void run(), waitMs);
	};

	void run();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
