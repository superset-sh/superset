export interface TerminalLifecycleRecord {
	status: string;
	disposeRequestedAt?: number | null;
}

export type TerminalLifecycleState =
	| "missing"
	| "active"
	| "exited"
	| "disposed";

export function terminalLifecycleState(
	record: TerminalLifecycleRecord | undefined,
): TerminalLifecycleState {
	if (!record) return "missing";
	if (record.disposeRequestedAt != null || record.status === "disposed") {
		return "disposed";
	}
	return record.status === "active" ? "active" : "exited";
}

export class TerminalLifecycleOperations {
	private readonly pending = new Map<
		string,
		{ result: Promise<unknown>; workspaceId?: string }
	>();

	getWorkspaceId(terminalId: string): string | undefined {
		return this.pending.get(terminalId)?.workspaceId;
	}

	run<T>(
		terminalId: string,
		operation: () => Promise<T>,
		workspaceId?: string,
	): Promise<T> {
		const previous = this.pending.get(terminalId);
		const result = (previous?.result ?? Promise.resolve())
			.catch(() => {})
			.then(operation);
		const entry = {
			result,
			workspaceId: previous?.workspaceId ?? workspaceId,
		};
		this.pending.set(terminalId, entry);
		const cleanup = () => {
			if (this.pending.get(terminalId) === entry)
				this.pending.delete(terminalId);
		};
		void result.then(cleanup, cleanup);
		return result;
	}
}

export class MissingTerminalObservations {
	private previous = new Map<string, number | undefined>();

	confirm(
		candidates: ReadonlyMap<string, { createdAt?: number }>,
	): Set<string> {
		const confirmed = new Set<string>();
		for (const [id, row] of candidates) {
			if (this.previous.has(id) && this.previous.get(id) === row.createdAt)
				confirmed.add(id);
		}
		this.previous = new Map(
			[...candidates].map(([id, row]) => [id, row.createdAt]),
		);
		return confirmed;
	}

	reset(): void {
		this.previous.clear();
	}
}
