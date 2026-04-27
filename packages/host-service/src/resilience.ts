const HOST_SERVICE_PREFIX = "[host-service]";

let processGuardsInstalled = false;

type MaybePromise<T> = T | Promise<T>;

export function reportHostServiceError(scope: string, error: unknown): void {
	console.error(`${HOST_SERVICE_PREFIX} ${scope}:`, error);
}

export function installHostServiceProcessGuards(): void {
	if (processGuardsInstalled) return;
	processGuardsInstalled = true;

	process.on("uncaughtException", (error) => {
		reportHostServiceError("recovered from uncaught exception", error);
	});

	process.on("unhandledRejection", (reason) => {
		reportHostServiceError("recovered from unhandled rejection", reason);
	});
}

export function runHostServiceBackgroundTask(
	scope: string,
	task: () => MaybePromise<unknown>,
): void {
	void Promise.resolve()
		.then(task)
		.catch((error: unknown) => {
			reportHostServiceError(scope, error);
		});
}

export function createGuardedHandler<Args extends unknown[]>(
	scope: string,
	handler: (...args: Args) => MaybePromise<unknown>,
): (...args: Args) => void {
	return (...args: Args) => {
		runHostServiceBackgroundTask(scope, () => handler(...args));
	};
}
