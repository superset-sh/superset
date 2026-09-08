interface StartupDependencies {
	reconcile(): Promise<boolean>;
	prewarm(): void;
}

/** Share reconciliation across windows while keeping v1 warmup independent. */
export class V1RuntimeStartup {
	private reconciliation: Promise<boolean> | null = null;
	private prewarmed = false;

	constructor(private readonly dependencies: StartupDependencies) {}

	async start(prewarm: boolean, stillAllowed: () => boolean): Promise<void> {
		if (!stillAllowed()) return;
		if (!this.reconciliation) {
			const attempt = this.dependencies.reconcile();
			this.reconciliation = attempt;
			// Only successful work consumes the latch. Identity checks preserve
			// a newer attempt if retirement reset this one while it was running.
			void attempt.then(
				(success) => {
					if (!success && this.reconciliation === attempt)
						this.reconciliation = null;
				},
				() => {
					if (this.reconciliation === attempt) this.reconciliation = null;
				},
			);
		}
		const attempt = this.reconciliation;
		const success = await attempt;
		if (!success || this.reconciliation !== attempt || !stillAllowed()) return;
		if (prewarm && !this.prewarmed) {
			this.dependencies.prewarm();
			this.prewarmed = true;
		}
	}

	reset(): void {
		this.reconciliation = null;
		this.prewarmed = false;
	}
}
