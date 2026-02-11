export class GenerationWatchdog {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private triggered = false;

	constructor(
		private readonly onTimeout: (params: { reason: string }) => void,
	) {}

	arm({ timeoutMs, reason }: { timeoutMs: number; reason: string }): void {
		this.clear();
		this.timer = setTimeout(() => {
			this.triggered = true;
			this.onTimeout({ reason });
		}, timeoutMs);
	}

	clear(): void {
		if (!this.timer) return;
		clearTimeout(this.timer);
		this.timer = null;
	}

	get wasTriggered(): boolean {
		return this.triggered;
	}
}
