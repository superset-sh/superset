import { LegacyMigrator } from "./migration/migrator";
import { ensureDesktopStorageDirs } from "./storage/config";
import { DesktopLowdbAdapter } from "./storage/lowdb-adapter";
import {
	DesktopChangeOrchestrator,
	DesktopEnvironmentOrchestrator,
	DesktopProcessOrchestrator,
	DesktopWorkspaceOrchestrator,
} from "./storage/orchestrators";
import { DomainVersion } from "./storage/version";
import { UiStore } from "./ui-store/store";
import { WorkspaceComposer } from "./workspace-composition/composer";

/**
 * Desktop stores singleton
 * Initializes and provides access to domain store, UI store, and composer
 */
class DesktopStores {
	private static instance: DesktopStores;
	private static initPromise: Promise<void> | null = null;
	private domainStorage: DesktopLowdbAdapter;
	private uiStore: UiStore;
	private composer: WorkspaceComposer;
	private environmentOrchestrator: DesktopEnvironmentOrchestrator;
	private workspaceOrchestrator: DesktopWorkspaceOrchestrator;
	private processOrchestrator: DesktopProcessOrchestrator;
	private changeOrchestrator: DesktopChangeOrchestrator;

	private constructor() {
		// Initialize domain storage
		this.domainStorage = new DesktopLowdbAdapter();

		// Initialize UI store
		this.uiStore = new UiStore();

		// Initialize composer
		this.composer = new WorkspaceComposer(this.uiStore);

		// Initialize orchestrators
		this.environmentOrchestrator = new DesktopEnvironmentOrchestrator(
			this.domainStorage,
		);
		this.workspaceOrchestrator = new DesktopWorkspaceOrchestrator(
			this.domainStorage,
		);
		this.processOrchestrator = new DesktopProcessOrchestrator(
			this.domainStorage,
		);
		this.changeOrchestrator = new DesktopChangeOrchestrator(this.domainStorage);
	}

	private async initializeAsync(): Promise<void> {
		try {
			// Ensure storage directories exist first
			await ensureDesktopStorageDirs();

			// Then run migration if needed
			await this.runMigrationIfNeeded();
		} catch (error) {
			console.error("Failed to initialize Desktop stores:", error);
		}
	}

	private async runMigrationIfNeeded(): Promise<void> {
		const migrator = new LegacyMigrator();
		if (migrator.shouldMigrate()) {
			console.log("[DesktopStores] Running migration from legacy config...");
			const result = await migrator.migrate(
				this.environmentOrchestrator,
				this.workspaceOrchestrator,
				this.uiStore,
				false,
			);
			if (result.success) {
				console.log(
					`[DesktopStores] Migration completed: ${result.migrated.workspaces} workspaces migrated`,
				);
			} else {
				console.error(`[DesktopStores] Migration failed: ${result.error}`);
			}
		}

		// Initialize versions if not set
		if (DomainVersion.read() === 0) {
			DomainVersion.write();
		}
		if (this.uiStore.readUiVersion() === 0) {
			this.uiStore.writeUiVersion();
		}
	}

	static getInstance(): DesktopStores {
		if (!DesktopStores.instance) {
			DesktopStores.instance = new DesktopStores();
		}
		return DesktopStores.instance;
	}

	/**
	 * Initialize async operations (migration, version writes)
	 * Must be called once after getInstance() and before using the stores
	 */
	static async initialize(): Promise<void> {
		if (!DesktopStores.initPromise) {
			const instance = DesktopStores.getInstance();
			DesktopStores.initPromise = instance.initializeAsync();
		}
		return DesktopStores.initPromise;
	}

	getDomainStorage() {
		return this.domainStorage;
	}

	getUiStore() {
		return this.uiStore;
	}

	getComposer() {
		return this.composer;
	}

	getEnvironmentOrchestrator() {
		return this.environmentOrchestrator;
	}

	getWorkspaceOrchestrator() {
		return this.workspaceOrchestrator;
	}

	getProcessOrchestrator() {
		return this.processOrchestrator;
	}

	getChangeOrchestrator() {
		return this.changeOrchestrator;
	}
}

export const desktopStores = DesktopStores.getInstance();
export { DesktopStores };
