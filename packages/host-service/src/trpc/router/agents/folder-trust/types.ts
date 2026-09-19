/**
 * What an account's trust store says about one folder. "declined" is an
 * explicit refusal the host must never work around; "none" is the ordinary
 * never-asked state.
 */
export type FolderTrustDecision = "trusted" | "declined" | "none";

export interface FolderTrustProvider {
	/** Matched against the preset id and the launch executable's basename. */
	family: string;
	storeFile(env: Record<string, string>): string;
	discoverStoreFiles(): Promise<string[]>;
	/** A missing or unreadable store decides nothing. */
	readDecision(
		storeFile: string,
		folderPath: string,
	): Promise<FolderTrustDecision>;
	/**
	 * Record acceptance in the store. Throws rather than clobbering a store it
	 * cannot parse, and never overrides a "declined".
	 */
	persist(storeFile: string, folderPath: string): Promise<void>;
	/**
	 * Args that trust `folderPaths` for one launch without touching the store.
	 * Preferred over `persist` for trust carried between accounts: nothing
	 * accumulates in a config file the user owns.
	 */
	launchOverride?(folderPaths: string[]): string[];
}
