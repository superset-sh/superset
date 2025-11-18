import type { Database } from "./types";

/**
 * Generic storage adapter interface
 * Abstracts persistence layer to allow easy migration from Lowdb to other solutions
 */
export interface StorageAdapter {
	/**
	 * Read the entire database
	 */
	read(): Promise<Database>;

	/**
	 * Write the entire database
	 */
	write(data: Database): Promise<void>;

	/**
	 * Get a specific collection
	 */
	getCollection<K extends keyof Database>(collection: K): Promise<Database[K]>;

	/**
	 * Update a specific collection
	 */
	updateCollection<K extends keyof Database>(
		collection: K,
		data: Database[K],
	): Promise<void>;

	/**
	 * Get a single entity from a collection by ID
	 */
	get<K extends keyof Database>(
		collection: K,
		id: string,
	): Promise<Database[K][string] | undefined>;

	/**
	 * Set a single entity in a collection
	 */
	set<K extends keyof Database>(
		collection: K,
		id: string,
		value: Database[K][string],
	): Promise<void>;

	/**
	 * Delete a single entity from a collection
	 */
	delete<K extends keyof Database>(collection: K, id: string): Promise<void>;

	/**
	 * Check if an entity exists in a collection
	 */
	has<K extends keyof Database>(collection: K, id: string): Promise<boolean>;

	/**
	 * Clear all data (useful for testing)
	 */
	clear(): Promise<void>;
}
