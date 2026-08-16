import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { pluginKv, plugins } from "../db/schema";

export type PluginRow = typeof plugins.$inferSelect;

const MAX_KV_VALUE_BYTES = 256 * 1024;

export class PluginStore {
	constructor(private readonly db: HostDb) {}

	list(): PluginRow[] {
		return this.db.query.plugins.findMany().sync();
	}

	get(id: string): PluginRow | undefined {
		return this.db.query.plugins
			.findFirst({ where: eq(plugins.id, id) })
			.sync();
	}

	upsert(row: {
		id: string;
		name: string;
		version: string;
		description: string | null;
		sourceType: PluginRow["sourceType"];
		source: string;
		sourceCommit: string | null;
		manifestJson: string;
	}): void {
		this.db
			.insert(plugins)
			.values(row)
			.onConflictDoUpdate({
				target: plugins.id,
				set: { ...row, updatedAt: Date.now() },
			})
			.run();
	}

	setEnabled(id: string, enabled: boolean): void {
		this.db
			.update(plugins)
			.set({ enabled, updatedAt: Date.now() })
			.where(eq(plugins.id, id))
			.run();
	}

	remove(id: string): void {
		this.db.delete(plugins).where(eq(plugins.id, id)).run();
	}

	kvGet(pluginId: string, key: string): unknown | null {
		const row = this.db.query.pluginKv
			.findFirst({
				where: and(eq(pluginKv.pluginId, pluginId), eq(pluginKv.key, key)),
			})
			.sync();
		if (!row) return null;
		try {
			return JSON.parse(row.valueJson);
		} catch {
			return null;
		}
	}

	kvSet(pluginId: string, key: string, value: unknown): void {
		const valueJson = JSON.stringify(value);
		if (valueJson === undefined) {
			throw new Error(`plugin kv value for "${key}" is not JSON-serializable`);
		}
		if (Buffer.byteLength(valueJson, "utf8") > MAX_KV_VALUE_BYTES) {
			throw new Error(
				`plugin kv value for "${key}" exceeds ${MAX_KV_VALUE_BYTES} bytes`,
			);
		}
		this.db
			.insert(pluginKv)
			.values({ pluginId, key, valueJson })
			.onConflictDoUpdate({
				target: [pluginKv.pluginId, pluginKv.key],
				set: { valueJson, updatedAt: Date.now() },
			})
			.run();
	}

	kvDelete(pluginId: string, key: string): void {
		this.db
			.delete(pluginKv)
			.where(and(eq(pluginKv.pluginId, pluginId), eq(pluginKv.key, key)))
			.run();
	}

	kvKeys(pluginId: string): string[] {
		return this.db.query.pluginKv
			.findMany({ where: eq(pluginKv.pluginId, pluginId) })
			.sync()
			.map((row) => row.key);
	}
}
