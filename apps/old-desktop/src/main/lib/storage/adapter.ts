import type { DesktopDatabase, SerializedDesktopDatabase } from "./types";

/**
 * Generic storage adapter interface for Desktop domain storage
 * Collections are stored in separate files per the plan requirements
 */
export interface DesktopStorageAdapter {
	/**
	 * Read the entire database (loads all collection files)
	 */
	read(): Promise<DesktopDatabase>;

	/**
	 * Write the entire database (writes all collection files)
	 */
	write(data: DesktopDatabase): Promise<void>;

	/**
	 * Get a specific collection
	 */
	getCollection<K extends keyof DesktopDatabase>(
		collection: K,
	): Promise<DesktopDatabase[K]>;

	/**
	 * Update a specific collection
	 */
	updateCollection<K extends keyof DesktopDatabase>(
		collection: K,
		data: DesktopDatabase[K],
	): Promise<void>;

	/**
	 * Get a single entity from a collection by ID
	 */
	get<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<DesktopDatabase[K][string] | undefined>;

	/**
	 * Set a single entity in a collection
	 */
	set<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
		value: DesktopDatabase[K][string],
	): Promise<void>;

	/**
	 * Delete a single entity from a collection
	 */
	delete<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<void>;

	/**
	 * Check if an entity exists in a collection
	 */
	has<K extends keyof DesktopDatabase>(
		collection: K,
		id: string,
	): Promise<boolean>;

	/**
	 * Clear all data (useful for testing)
	 */
	clear(): Promise<void>;
}
