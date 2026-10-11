import { electronTrpcClient } from "renderer/lib/trpc-client";

export interface V1MigrationRunLockClient {
	acquire(): Promise<{ acquired: true; token: string } | { acquired: false }>;
	release(token: string): Promise<void>;
}

export const electronV1MigrationRunLock: V1MigrationRunLockClient = {
	acquire: () => electronTrpcClient.migration.acquireRunLock.mutate(),
	release: async (token) => {
		await electronTrpcClient.migration.releaseRunLock.mutate({ token });
	},
};

const LOCK_POLL_MS = 2_000;

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForV1MigrationRunLock({
	client = electronV1MigrationRunLock,
	shouldStop = () => false,
	pollMs = LOCK_POLL_MS,
	wait = sleep,
}: {
	client?: V1MigrationRunLockClient;
	shouldStop?: () => boolean;
	pollMs?: number;
	wait?: (ms: number) => Promise<void>;
} = {}): Promise<string | null> {
	while (!shouldStop()) {
		const lock = await client.acquire();
		if (lock.acquired) {
			if (!shouldStop()) return lock.token;
			await client.release(lock.token).catch(() => {});
			return null;
		}
		await wait(pollMs);
	}
	return null;
}

// Host adopt deletes rows sharing a branch or path, so an import must never
// run next to the automatic pass.
export async function withV1MigrationRunLock<T>(
	task: () => Promise<T>,
	options: Parameters<typeof waitForV1MigrationRunLock>[0] = {},
): Promise<T> {
	const client = options.client ?? electronV1MigrationRunLock;
	const token = await waitForV1MigrationRunLock({ ...options, client });
	if (token === null) throw new Error("Stopped waiting for the v1 import");
	try {
		return await task();
	} finally {
		await client.release(token).catch(() => {});
	}
}
