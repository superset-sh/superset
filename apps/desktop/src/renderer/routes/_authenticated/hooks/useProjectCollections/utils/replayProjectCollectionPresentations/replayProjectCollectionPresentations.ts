import type { HostTagFoldersResult } from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import type { ProjectCollectionPendingPresentation } from "shared/project-collections";
import { isUnsupportedProjectScope } from "../../projectCollectionMutations";

export interface ProjectCollectionReplayRetry {
	attempts: number;
	retryAt: number;
}

export async function replayProjectCollectionPresentations({
	hosts,
	pending,
	readPending,
	enqueue,
	upsert,
	acknowledge,
	invalidate,
	retries = new Map<string, ProjectCollectionReplayRetry>(),
	now = Date.now,
	readHost = (host: HostTagFoldersResult) => host,
}: {
	hosts: HostTagFoldersResult[];
	pending: readonly ProjectCollectionPendingPresentation[];
	readPending: () => readonly ProjectCollectionPendingPresentation[];
	enqueue: (work: () => Promise<void>) => Promise<void>;
	upsert: (
		host: HostTagFoldersResult,
		row: ProjectCollectionPendingPresentation,
	) => Promise<unknown>;
	acknowledge: (row: ProjectCollectionPendingPresentation) => Promise<unknown>;
	invalidate: (host: HostTagFoldersResult) => void;
	retries?: Map<string, ProjectCollectionReplayRetry>;
	now?: () => number;
	readHost?: (host: HostTagFoldersResult) => HostTagFoldersResult;
}) {
	for (const machineId of retries.keys()) {
		if (!pending.some((row) => row.machineId === machineId))
			retries.delete(machineId);
	}
	const fail = (machineId: string) => {
		const attempts = (retries.get(machineId)?.attempts ?? 0) + 1;
		retries.set(machineId, {
			attempts,
			retryAt: now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts - 1, 6)),
		});
	};
	const touched = new Map<string, HostTagFoldersResult>();
	const failedHosts = new Set<string>();
	const unsupportedHosts = new Set<string>();
	for (const row of pending) {
		const host = hosts.find((host) => host.target.machineId === row.machineId);
		if (
			!host?.target.hostUrl ||
			(host.status !== "ready" && host.status !== "error") ||
			failedHosts.has(row.machineId) ||
			(retries.get(row.machineId)?.retryAt ?? 0) > now()
		)
			continue;
		try {
			await enqueue(async () => {
				const latest = readPending().find(
					(entry) => entry.machineId === row.machineId && entry.tag === row.tag,
				);
				if (
					!latest ||
					JSON.stringify(latest.setting) !== JSON.stringify(row.setting)
				)
					return;
				if (unsupportedHosts.has(row.machineId)) {
					await acknowledge(row);
					return;
				}
				const currentHost = readHost(host);
				if (currentHost.status !== "ready" && currentHost.status !== "error")
					return;
				if (row.setting.updatedAt === undefined) {
					await acknowledge(row);
					return;
				}
				try {
					await upsert(currentHost, row);
					retries.delete(row.machineId);
					touched.set(row.machineId, host);
				} catch (error) {
					const code =
						error && typeof error === "object"
							? (error as { data?: { code?: string } }).data?.code
							: undefined;
					if (!isUnsupportedProjectScope(error) && code !== "BAD_REQUEST") {
						failedHosts.add(row.machineId);
						fail(row.machineId);
						return;
					}
					unsupportedHosts.add(row.machineId);
				}
				await acknowledge(row);
			});
		} catch {
			failedHosts.add(row.machineId);
			fail(row.machineId);
		}
	}
	for (const host of touched.values()) invalidate(host);
}

export function withPendingProjectCollectionPresentations(
	hosts: HostTagFoldersResult[],
	pending: readonly ProjectCollectionPendingPresentation[],
): HostTagFoldersResult[] {
	return hosts.map((host) => {
		const entries = pending.filter((row) => {
			if (row.machineId !== host.target.machineId) return false;
			const current = host.settings.find(
				(setting) => setting.scope === "projects" && setting.tag === row.tag,
			);
			if (
				current &&
				current.updatedAt !== undefined &&
				row.setting.updatedAt !== undefined &&
				current.updatedAt >= row.setting.updatedAt
			)
				return false;
			return (
				host.status !== "ready" ||
				current !== undefined ||
				row.setting.create === true
			);
		});
		if (!entries.length) return host;
		return {
			...host,
			settings: [
				...host.settings.filter(
					(setting) =>
						!entries.some(
							(row) =>
								setting.scope === row.setting.scope && setting.tag === row.tag,
						),
				),
				...entries.map((row) => row.setting),
			],
		};
	});
}
