import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { JSONFilePreset } from "lowdb/node";
import type { StorageAdapter } from "./adapter";
import { getDbPath } from "./config";
import {
	createEmptyDatabase,
	type Database,
	type SerializedDatabase,
} from "./types";

// Helper type to extract value type from Record collections
type CollectionValue<K extends keyof Database> = Database[K] extends Record<
	string,
	infer V
>
	? V
	: never;

/**
 * Lowdb implementation of StorageAdapter
 * Handles JSON file persistence with date serialization/deserialization
 */
export class LowdbAdapter implements StorageAdapter {
	private db: Awaited<
		ReturnType<typeof JSONFilePreset<SerializedDatabase>>
	> | null = null;
	private readonly dbPath: string;

	constructor(dbPath?: string) {
		this.dbPath = dbPath ?? getDbPath();
	}

	/**
	 * Initialize the database connection
	 */
	private async init(): Promise<void> {
		if (this.db) return;

		// Ensure the parent directory exists (for both default and custom paths)
		const parentDir = dirname(this.dbPath);
		if (!existsSync(parentDir)) {
			await mkdir(parentDir, { recursive: true, mode: 0o700 });
		}

		// Check if database file exists before creating
		const dbExists = existsSync(this.dbPath);

		this.db = await JSONFilePreset<SerializedDatabase>(
			this.dbPath,
			createEmptyDatabase(),
		);

		// If database was just created, write the default data to disk
		if (!dbExists) {
			await this.db.write();
		}
	}

	/**
	 * Deserialize dates from ISO strings to Date objects
	 */
	private deserializeDates<T>(obj: any): T {
		if (obj === null || obj === undefined) return obj;

		if (typeof obj === "string" && this.isISODate(obj)) {
			return new Date(obj) as any;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.deserializeDates(item)) as any;
		}

		if (typeof obj === "object") {
			const result: any = {};
			for (const [key, value] of Object.entries(obj)) {
				result[key] = this.deserializeDates(value);
			}
			return result;
		}

		return obj;
	}

	/**
	 * Serialize dates to ISO strings
	 */
	private serializeDates<T>(obj: T): any {
		if (obj === null || obj === undefined) return obj;

		if (obj instanceof Date) {
			return obj.toISOString();
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.serializeDates(item));
		}

		if (typeof obj === "object") {
			const result: any = {};
			for (const [key, value] of Object.entries(obj)) {
				result[key] = this.serializeDates(value);
			}
			return result;
		}

		return obj;
	}

	/**
	 * Check if a string is an ISO date format
	 */
	private isISODate(str: string): boolean {
		const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
		return isoDateRegex.test(str);
	}

	async read(): Promise<Database> {
		await this.init();
		await this.db!.read();
		return this.deserializeDates<Database>(this.db!.data);
	}

	async write(data: Database): Promise<void> {
		await this.init();
		this.db!.data = this.serializeDates(data);
		await this.db!.write();
	}

	async getCollection<K extends keyof Database>(
		collection: K,
	): Promise<Database[K]> {
		await this.init();
		await this.db!.read();
		return this.deserializeDates<Database[K]>(this.db!.data[collection]);
	}

	async updateCollection<K extends keyof Database>(
		collection: K,
		data: Database[K],
	): Promise<void> {
		await this.init();
		await this.db!.read();
		this.db!.data[collection] = this.serializeDates(data);
		await this.db!.write();
	}

	async get<K extends keyof Database>(
		collection: K,
		id: string,
	): Promise<CollectionValue<K> | undefined> {
		await this.init();
		await this.db!.read();
		const coll = this.db!.data[collection] as Record<string, unknown>;
		const item = coll[id];
		return item ? this.deserializeDates(item) : undefined;
	}

	async set<K extends keyof Database>(
		collection: K,
		id: string,
		value: CollectionValue<K>,
	): Promise<void> {
		await this.init();
		await this.db!.read();
		const coll = this.db!.data[collection] as Record<string, unknown>;
		coll[id] = this.serializeDates(value);
		await this.db!.write();
	}

	async delete<K extends keyof Database>(
		collection: K,
		id: string,
	): Promise<void> {
		await this.init();
		await this.db!.read();
		const coll = this.db!.data[collection] as Record<string, unknown>;
		delete coll[id];
		await this.db!.write();
	}

	async has<K extends keyof Database>(
		collection: K,
		id: string,
	): Promise<boolean> {
		await this.init();
		await this.db!.read();
		const coll = this.db!.data[collection] as Record<string, unknown>;
		return id in coll;
	}

	async clear(): Promise<void> {
		await this.init();
		this.db!.data = createEmptyDatabase();
		await this.db!.write();
	}
}
