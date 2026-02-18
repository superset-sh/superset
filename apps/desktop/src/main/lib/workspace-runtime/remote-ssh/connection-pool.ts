/**
 * SSH Connection Pool
 *
 * Manages shared SSH connections keyed by "user@host:port".
 * Reuses existing connections for the same host to avoid duplicate sessions.
 * Disposes idle connections after 60s of inactivity.
 */

import { SSHConnection } from "./connection";
import { getPoolKey, type SSHHostConfig } from "./types";

const IDLE_TIMEOUT_MS = 60_000;

interface PoolEntry {
	connection: SSHConnection;
	refCount: number;
	idleTimer: ReturnType<typeof setTimeout> | null;
}

export class SSHConnectionPool {
	private pool = new Map<string, PoolEntry>();

	/**
	 * Get or create a shared connection for the given host config.
	 * Increments the reference count.
	 */
	async getOrCreate(config: SSHHostConfig): Promise<SSHConnection> {
		const key = getPoolKey(config);

		const existing = this.pool.get(key);
		if (existing) {
			existing.refCount++;
			if (existing.idleTimer) {
				clearTimeout(existing.idleTimer);
				existing.idleTimer = null;
			}

			// Reconnect if needed
			if (!existing.connection.isConnected) {
				await existing.connection.connect();
			}

			return existing.connection;
		}

		const connection = new SSHConnection(config);
		await connection.connect();

		this.pool.set(key, {
			connection,
			refCount: 1,
			idleTimer: null,
		});

		return connection;
	}

	/**
	 * Release a connection back to the pool.
	 * Starts the idle timer if no more references.
	 */
	release(config: SSHHostConfig): void {
		const key = getPoolKey(config);
		const entry = this.pool.get(key);
		if (!entry) return;

		entry.refCount = Math.max(0, entry.refCount - 1);

		if (entry.refCount === 0) {
			entry.idleTimer = setTimeout(() => {
				this.dispose(key);
			}, IDLE_TIMEOUT_MS);
		}
	}

	/**
	 * Get a connection if it exists in the pool (without creating).
	 */
	get(config: SSHHostConfig): SSHConnection | null {
		const key = getPoolKey(config);
		return this.pool.get(key)?.connection ?? null;
	}

	/**
	 * Dispose a specific connection.
	 */
	private dispose(key: string): void {
		const entry = this.pool.get(key);
		if (!entry) return;

		if (entry.idleTimer) {
			clearTimeout(entry.idleTimer);
		}
		entry.connection.disconnect();
		this.pool.delete(key);
	}

	/**
	 * Dispose all connections in the pool.
	 */
	disposeAll(): void {
		for (const [key] of this.pool) {
			this.dispose(key);
		}
	}

	/**
	 * Get the number of active connections.
	 */
	get size(): number {
		return this.pool.size;
	}
}
