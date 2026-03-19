export interface SessionInitScope {
	scopeKey: string;
	organizationId: string;
	workspaceId: string;
	sessionId: string;
}

interface SessionInitRunnerOptions {
	maxRetries: number;
	retryDelayMs: number;
	hasCurrentSessionRecord: () => boolean;
	isScopeCurrent: (scopeKey: string) => boolean;
	setIsSessionInitializing: (isInitializing: boolean) => void;
	createSessionRecord: (scope: SessionInitScope) => Promise<void>;
	reportCreateSessionError: (error: unknown, scope: SessionInitScope) => void;
	onRetryExhausted: (scope: SessionInitScope) => void;
	scheduleRetryTimeout?: (callback: () => void, delayMs: number) => unknown;
	clearRetryTimeout?: (handle: unknown) => void;
}

interface RunSessionInitInput {
	scope: SessionInitScope;
	retryOnFailure: boolean;
}

export interface SessionInitRunner {
	run: (input: RunSessionInitInput) => Promise<boolean>;
	resetScope: (scopeKey: string) => void;
	markReady: (scopeKey: string) => void;
	dispose: () => void;
}

export function createSessionInitRunner(
	options: SessionInitRunnerOptions,
): SessionInitRunner {
	let activeScopeKey: string | null = null;
	let retryCount = 0;
	let inFlight: Promise<boolean> | null = null;
	let retryTimeoutHandle: unknown = null;
	const scheduleRetryTimeout =
		options.scheduleRetryTimeout ??
		((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
	const clearRetryTimeout =
		options.clearRetryTimeout ??
		((handle: unknown) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>));

	const clearPendingRetry = () => {
		if (retryTimeoutHandle === null) return;
		clearRetryTimeout(retryTimeoutHandle);
		retryTimeoutHandle = null;
	};

	const resetScope = (scopeKey: string) => {
		if (activeScopeKey === scopeKey) return;
		activeScopeKey = scopeKey;
		retryCount = 0;
		inFlight = null;
		clearPendingRetry();
		options.setIsSessionInitializing(false);
	};

	const markReady = (scopeKey: string) => {
		if (activeScopeKey !== scopeKey) return;
		retryCount = 0;
		inFlight = null;
		clearPendingRetry();
		options.setIsSessionInitializing(false);
	};

	const run = async ({
		scope,
		retryOnFailure,
	}: RunSessionInitInput): Promise<boolean> => {
		resetScope(scope.scopeKey);
		if (options.hasCurrentSessionRecord()) {
			markReady(scope.scopeKey);
			return true;
		}

		if (inFlight) return inFlight;
		options.setIsSessionInitializing(true);

		const attemptPromise = options
			.createSessionRecord(scope)
			.then(() => {
				if (!options.isScopeCurrent(scope.scopeKey)) return false;
				markReady(scope.scopeKey);
				return true;
			})
			.catch((error) => {
				options.reportCreateSessionError(error, scope);
				if (!options.isScopeCurrent(scope.scopeKey)) return false;

				if (retryOnFailure) {
					const nextRetryCount = retryCount + 1;
					retryCount = nextRetryCount;
					if (nextRetryCount <= options.maxRetries) {
						clearPendingRetry();
						retryTimeoutHandle = scheduleRetryTimeout(() => {
							retryTimeoutHandle = null;
							if (!options.isScopeCurrent(scope.scopeKey)) return;
							void run({ scope, retryOnFailure: true });
						}, options.retryDelayMs);
						return false;
					}
					options.onRetryExhausted(scope);
				}

				options.setIsSessionInitializing(false);
				return false;
			})
			.finally(() => {
				if (!options.isScopeCurrent(scope.scopeKey)) return;
				if (inFlight === attemptPromise) inFlight = null;
			});

		inFlight = attemptPromise;
		return attemptPromise;
	};

	const dispose = () => {
		inFlight = null;
		clearPendingRetry();
	};

	return {
		run,
		resetScope,
		markReady,
		dispose,
	};
}
