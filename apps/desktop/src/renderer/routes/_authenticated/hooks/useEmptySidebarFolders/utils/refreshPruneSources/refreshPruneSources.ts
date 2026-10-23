import type { FindOrphanedTagFoldersInput } from "renderer/routes/_authenticated/utils/workspaceTagFolders";

export interface PruneSourceRefetchers {
	/** The host roster, which a reload restores from the persisted cache. */
	roster: () => Promise<unknown>;
	cloud: () => Promise<unknown>;
	/** Every reachable host's workspace and project lists. */
	hosts: () => Promise<unknown>;
}

export interface RefreshPruneSourcesOptions {
	current: FindOrphanedTagFoldersInput;
	/** The input as of the latest render; refetched data reaches it on the next one. */
	readLatest: () => FindOrphanedTagFoldersInput;
	refetch: PruneSourceRefetchers;
	timeoutMs: number;
	/**
	 * How long to wait, after the refetches, for a render that carries their
	 * data. A host that stays offline uses all of it.
	 */
	settleMs: number;
	pollMs: number;
}

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

async function settleWithin(
	promise: Promise<unknown>,
	ms: number,
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		promise.catch(() => {}),
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, ms);
		}),
	]);
	clearTimeout(timer);
}

/**
 * Refetches the liveness sources that are not live before a prune decides.
 * A window that is not focused never refetches a roster restored from the
 * persisted cache on its own, so without this every prune would skip. The
 * caller still decides from the returned input: a source that stays not
 * live keeps its folders skipped.
 */
export async function refreshPruneSources({
	current,
	readLatest,
	refetch,
	timeoutMs,
	settleMs,
	pollMs,
}: RefreshPruneSourcesOptions): Promise<FindOrphanedTagFoldersInput> {
	const needsRoster = !current.rosterLive;
	const needsCloud = !current.cloudLive;
	const needsHosts = current.hostReads.some(
		(read) => !read.live || !read.projectsLive,
	);
	if (!needsRoster && !needsCloud && !needsHosts) return current;

	await settleWithin(
		Promise.allSettled([
			needsRoster ? refetch.roster() : null,
			needsCloud ? refetch.cloud() : null,
			needsHosts ? refetch.hosts() : null,
		]),
		timeoutMs,
	);

	const deadline = Date.now() + settleMs;
	for (;;) {
		const latest = readLatest();
		const caughtUp =
			(!needsRoster || latest.rosterLive) &&
			(!needsCloud || latest.cloudLive) &&
			(!needsHosts ||
				latest.hostReads.every((read) => read.live && read.projectsLive));
		if (caughtUp || Date.now() >= deadline) return latest;
		await sleep(pollMs);
	}
}
