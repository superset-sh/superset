import type { BackgroundTask } from "@superset/chat/protocol";

const DETAIL_INTERVAL_MS = 1000;

export class BackgroundTasks {
	private readonly tasks = new Map<string, BackgroundTask>();
	private readonly pendingDetails = new Set<string>();
	private pendingFlush: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly publish: (tasks: BackgroundTask[]) => void,
		private readonly publishDetail: (id: string, detail: string) => void,
		private readonly detailIntervalMs = DETAIL_INTERVAL_MS,
	) {}

	has(id: string): boolean {
		return this.tasks.has(id);
	}

	canStop(id: string): boolean {
		return this.tasks.get(id)?.canStop === true;
	}

	start(task: BackgroundTask): void {
		this.tasks.set(task.id, task);
		this.emit();
	}

	update(
		id: string,
		patch: Partial<Pick<BackgroundTask, "name" | "detail" | "canStop">>,
	): void {
		const prior = this.tasks.get(id);
		if (!prior) return;
		const next = { ...prior, ...patch };
		const nameChanged =
			next.name !== prior.name || next.canStop !== prior.canStop;
		if (!nameChanged && next.detail === prior.detail) return;
		this.tasks.set(id, next);
		if (nameChanged) this.emit();
		else this.detailSoon(id);
	}

	end(id: string): void {
		if (this.tasks.delete(id)) this.emit();
	}

	clear(): void {
		if (this.tasks.size === 0) return;
		this.tasks.clear();
		this.emit();
	}

	dispose(): void {
		if (this.pendingFlush !== null) clearTimeout(this.pendingFlush);
		this.pendingFlush = null;
		this.pendingDetails.clear();
	}

	private detailSoon(id: string): void {
		this.pendingDetails.add(id);
		if (this.detailIntervalMs <= 0) {
			this.flushDetails();
			return;
		}
		if (this.pendingFlush !== null) return;
		this.pendingFlush = setTimeout(() => {
			this.pendingFlush = null;
			this.flushDetails();
		}, this.detailIntervalMs);
	}

	private flushDetails(): void {
		for (const id of this.pendingDetails) {
			const detail = this.tasks.get(id)?.detail;
			if (detail !== undefined) this.publishDetail(id, detail);
		}
		this.pendingDetails.clear();
	}

	private emit(): void {
		this.dispose();
		this.publish([...this.tasks.values()]);
	}
}
