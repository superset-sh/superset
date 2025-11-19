import { randomUUID } from "node:crypto";
import type {
	Change,
	ChangeOrchestrator as IChangeOrchestrator,
} from "../../types/change";
import type { StorageAdapter } from "../storage/adapter";

/**
 * Change orchestrator implementation using storage adapter
 * Handles CRUD operations for changes with cascade deletes for file diffs
 */
export class ChangeOrchestrator implements IChangeOrchestrator {
	constructor(private readonly storage: StorageAdapter) {}

	async list(workspaceId: string): Promise<Change[]> {
		const changes = await this.storage.getCollection("changes");
		return Object.values(changes).filter(
			(change) => change.workspaceId === workspaceId,
		);
	}

	async create(change: Omit<Change, "id" | "timestamp">): Promise<Change> {
		const newChange: Change = {
			...change,
			id: randomUUID(),
			createdAt: new Date(),
		};

		await this.storage.set("changes", newChange.id, newChange);
		return newChange;
	}

	async update(id: string, updates: Partial<Change>): Promise<void> {
		const existing = await this.storage.get("changes", id);
		if (!existing) {
			throw new Error(`Change with id ${id} not found`);
		}

		// Filter out immutable fields to prevent desync
		const {
			id: _,
			workspaceId: __,
			createdAt: ___,
			...updatesWithoutImmutable
		} = updates;

		const updated = { ...existing, ...updatesWithoutImmutable };
		await this.storage.set("changes", id, updated);
	}

	async delete(id: string): Promise<void> {
		// Cascade delete: remove all file diffs for this change
		const fileDiffs = await this.storage.getCollection("fileDiffs");
		const diffIds = Object.entries(fileDiffs)
			.filter(([_, diff]) => diff.changeId === id)
			.map(([diffId]) => diffId);

		for (const diffId of diffIds) {
			await this.storage.delete("fileDiffs", diffId);
		}

		// Delete the change itself
		await this.storage.delete("changes", id);
	}
}
