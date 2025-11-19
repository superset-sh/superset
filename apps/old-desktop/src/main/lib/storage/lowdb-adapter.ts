import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { JSONFilePreset } from "lowdb/node";
import type { DesktopStorageAdapter } from "./adapter";
import { getDesktopDbDir, getDomainCollectionPath } from "./config";
import {
	createEmptyDesktopDatabase,
	type DesktopDatabase,
	type SerializedDesktopDatabase,
} from "./types";

/**
 * Lowdb implementation of DesktopStorageAdapter
 * Handles JSON file persistence with date serialization/deserialization
 * Collections are stored in separate files per the plan requirements
 */
export class DesktopLowdbAdapter implements DesktopStorageAdapter {
	private collections: Map<
		keyof DesktopDatabase,
		Awaited<ReturnType<typeof JSONFilePreset<Record<string, any>>>>
	> = new Map();

	/**
	 * Initialize a collection file
	 */
	private async initCollection<K extends keyof DesktopDatabase>(
		collection: K,
	): Promise<void> {
		if (this.collections.has(collection)) return;

		const collectionPath = getDomainCollectionPath(collection);

		// Ensure the parent directory exists
		const parentDir = dirname(collectionPath);
		if (!existsSync(parentDir)) {
			await mkdir(parentDir, { recursive: true, mode: 0o700 });
		}

		const db = await JSONFilePreset<Record<string, any>>(collectionPath, {});

		this.collections.set(collection, db);
	}

	/**
	 * Initialize all collections
	 */
	private async initAllCollections(): Promise<void> {
		const collections: Array<keyof DesktopDatabase> = [
			"environments",
			"workspaces",
			"processes",
			"changes",
			"fileDiffs",
			"agentSummaries",
		];

		await Promise.all(
			collections.map((collection) => this.initCollection(collection)),
		);
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

	async read(): Promise<DesktopDatabase> {
		await this.initAllCollections();

		const result: any = {};
		for (const collection of this.collections.keys()) {
			const db = this.collections.get(collection)!;
			await db.read();
			result[collection] = this.deserializeDates(db.data);
		}

		return result as DesktopDatabase;
	}

	async write(data: DesktopDatabase): Promise<void> {
		await this.initAllCollections();

		for (const [collection, db] of this.collections.entries()) {
			const collectionData = data[collection];
			db.data = this.serializeDates(collectionData);
			await db.write();
		}
	}

	async getCollection<K extends keyof DesktopDatabase>(
		collection: K,
	): Promise<DesktopDatabase[K]> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		await db.read();
		return this.deserializeDates<DesktopDatabase[K]>(db.data);
	}

	async updateCollection<K extends keyof DesktopDatabase>(
		collection: K,
		data: DesktopDatabase[K],
	): Promise<void> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		db.data = this.serializeDates(data);
		await db.write();
	}

	async get<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<DesktopDatabase[K][string] | undefined> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		await db.read();
		const item = db.data[id];
		return item ? this.deserializeDates(item) : undefined;
	}

	async set<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
		value: DesktopDatabase[K][string],
	): Promise<void> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		await db.read();
		db.data[id] = this.serializeDates(value);
		await db.write();
	}

	async delete<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<void> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		await db.read();
		delete db.data[id];
		await db.write();
	}

	async has<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<boolean> {
		await this.initCollection(collection);
		const db = this.collections.get(collection)!;
		await db.read();
		return id in db.data;
	}

	async clear(): Promise<void> {
		await this.initAllCollections();

		for (const db of this.collections.values()) {
			db.data = {};
			await db.write();
		}
	}
}
