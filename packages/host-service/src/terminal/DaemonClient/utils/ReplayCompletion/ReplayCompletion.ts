export class ReplayCompletion {
	private state: "pending" | "ready" | "failed" = "pending";
	private readonly deferred = Promise.withResolvers<void>();
	private readonly timer: ReturnType<typeof setTimeout>;
	readonly promise = this.deferred.promise;

	constructor(timeoutMs: number, timeoutError: Error) {
		this.timer = setTimeout(() => this.reject(timeoutError), timeoutMs);
		void this.promise.catch(() => {});
	}

	get status(): "pending" | "ready" | "failed" {
		return this.state;
	}

	resolve(): void {
		if (this.state !== "pending") return;
		this.state = "ready";
		clearTimeout(this.timer);
		this.deferred.resolve();
	}

	reject(error: Error): void {
		if (this.state !== "pending") return;
		this.state = "failed";
		clearTimeout(this.timer);
		this.deferred.reject(error);
	}
}
