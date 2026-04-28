const HOST_SERVICE_PREFIX = "[host-service]";
const DEFAULT_STARTUP_RETRY_DELAY_MS = 5_000;
const DEFAULT_STARTUP_RETRY_MAX_DELAY_MS = 60_000;

let processGuardsInstalled = false;

type MaybePromise<T> = T | Promise<T>;
type ClosableServer = {
	close: () => void;
};

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

export function closeHostServiceServer(
	server: ClosableServer,
	scope = "server close failed",
): void {
	try {
		server.close();
	} catch (error) {
		reportHostServiceError(scope, error);
	}
}

export function runHostServiceMain(main: () => MaybePromise<void>): void {
	installHostServiceProcessGuards();

	let retryAttempt = 0;
	const run = () => {
		void Promise.resolve()
			.then(main)
			.then(() => {
				retryAttempt = 0;
			})
			.catch((error: unknown) => {
				const delayMs = Math.min(
					DEFAULT_STARTUP_RETRY_DELAY_MS * 2 ** retryAttempt,
					DEFAULT_STARTUP_RETRY_MAX_DELAY_MS,
				);
				retryAttempt += 1;
				reportHostServiceError(
					`failed to start; retrying in ${delayMs}ms`,
					error,
				);
				setTimeout(run, delayMs);
			});
	};

	run();
}
