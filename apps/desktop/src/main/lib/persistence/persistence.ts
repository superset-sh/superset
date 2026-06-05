import { join } from "node:path";
import { exposeElectronSQLitePersistence } from "@tanstack/electron-db-sqlite-persistence/main";
import { createNodeSQLitePersistence } from "@tanstack/node-db-sqlite-persistence";
import Database from "better-sqlite3";
import { ipcMain } from "electron";
import log from "electron-log/main";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "../app-environment";

type SQLitePersistence = ReturnType<typeof createNodeSQLitePersistence>;
type SQLitePersistenceAdapter = SQLitePersistence["adapter"];
type CommittedTransaction = Parameters<
	SQLitePersistenceAdapter["applyCommittedTx"]
>[1];

const VACUUM_RECLAIM_THRESHOLD_BYTES = 64 * 1024 * 1024;

let dispose: (() => void) | null = null;
let database: Database.Database | null = null;

function reclaimBloatedDatabaseFile(target: Database.Database): void {
	try {
		target.pragma("wal_checkpoint(TRUNCATE)");
		const pageSize = target.pragma("page_size", { simple: true }) as number;
		const freelistCount = target.pragma("freelist_count", {
			simple: true,
		}) as number;
		if (pageSize * freelistCount < VACUUM_RECLAIM_THRESHOLD_BYTES) {
			return;
		}
		target.exec("VACUUM");
		target.pragma("wal_checkpoint(TRUNCATE)");
	} catch (error) {
		log.warn(
			"[persistence] Failed to reclaim tanstack-db.sqlite space:",
			error,
		);
	}
}

function stripVolatileResumeFields(value: unknown): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return value;
	}
	const { updatedAt, ...stableFields } = value as Record<string, unknown>;
	return stableFields;
}

function getRedundantResumeSignature(
	transaction: CommittedTransaction,
): string | null {
	if (transaction.truncate || transaction.mutations.length > 0) {
		return null;
	}
	if ((transaction.rowMetadataMutations?.length ?? 0) > 0) {
		return null;
	}
	const metadataMutations = transaction.collectionMetadataMutations ?? [];
	if (metadataMutations.length === 0) {
		return null;
	}
	const stableResumeValues: unknown[] = [];
	for (const mutation of metadataMutations) {
		if (mutation.type !== "set" || mutation.key !== "electric:resume") {
			return null;
		}
		stableResumeValues.push(stripVolatileResumeFields(mutation.value));
	}
	return JSON.stringify(stableResumeValues);
}

function suppressIdleResumeWrites(
	persistence: SQLitePersistence,
): SQLitePersistence {
	const lastForwardedResumeByCollection = new Map<string, string>();
	const wrappedAdapters = new WeakMap<
		SQLitePersistenceAdapter,
		SQLitePersistenceAdapter
	>();

	const wrapAdapter = (
		adapter: SQLitePersistenceAdapter,
	): SQLitePersistenceAdapter => {
		const alreadyWrapped = wrappedAdapters.get(adapter);
		if (alreadyWrapped) {
			return alreadyWrapped;
		}
		const wrapped = new Proxy(adapter, {
			get(target, property, receiver) {
				if (property !== "applyCommittedTx") {
					const value = Reflect.get(target, property, receiver);
					return typeof value === "function" ? value.bind(target) : value;
				}
				return async (
					collectionId: string,
					transaction: CommittedTransaction,
				): Promise<void> => {
					const resumeSignature = getRedundantResumeSignature(transaction);
					if (
						resumeSignature !== null &&
						lastForwardedResumeByCollection.get(collectionId) ===
							resumeSignature
					) {
						return;
					}
					await target.applyCommittedTx(collectionId, transaction);
					if (resumeSignature !== null) {
						lastForwardedResumeByCollection.set(collectionId, resumeSignature);
					}
				};
			},
		});
		wrappedAdapters.set(adapter, wrapped);
		return wrapped;
	};

	const wrapResolved = (resolved: SQLitePersistence): SQLitePersistence => ({
		...resolved,
		adapter: wrapAdapter(resolved.adapter),
	});

	const resolveForCollection = persistence.resolvePersistenceForCollection;
	const resolveForMode = persistence.resolvePersistenceForMode;

	return {
		...persistence,
		adapter: wrapAdapter(persistence.adapter),
		resolvePersistenceForCollection: resolveForCollection
			? (options) => wrapResolved(resolveForCollection(options))
			: undefined,
		resolvePersistenceForMode: resolveForMode
			? (mode) => wrapResolved(resolveForMode(mode))
			: undefined,
	};
}

export function initTanstackDbPersistence(): void {
	ensureSupersetHomeDirExists();
	database = new Database(join(SUPERSET_HOME_DIR, "tanstack-db.sqlite"));
	reclaimBloatedDatabaseFile(database);
	const persistence = createNodeSQLitePersistence({
		database,
		appliedTxPruneMaxRows: 1_000,
		appliedTxPruneMaxAgeSeconds: 24 * 60 * 60,
	});
	dispose = exposeElectronSQLitePersistence({
		ipcMain,
		persistence: suppressIdleResumeWrites(persistence),
	});
}

export function shutdownTanstackDbPersistence(): void {
	dispose?.();
	dispose = null;
	database?.close();
	database = null;
}
