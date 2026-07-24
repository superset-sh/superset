/**
 * Shell readiness gate (OSC 133 semantic-prompt lifecycle).
 *
 * A terminal session that launches with a preset/agent command queues that
 * command and only writes it to the PTY once the shell is "ready". Readiness
 * is normally signalled by the OSC 133;A prompt marker our shell wrappers emit
 * — waiting for it prevents interactive startup hooks (direnv/devenv, etc.)
 * from swallowing the command as pre-prompt input.
 *
 * The failure mode this gate guards against: a launch config that *claims* to
 * emit the marker (see `shellLaunchExpectsReadyMarker`) but never actually does
 * — stale/rewritten wrapper files, a user startup file that clobbers the
 * precmd/PROMPT_COMMAND hook, or an exotic shell. Without a fallback the
 * readiness promise never resolves and the queued command is silently dropped:
 * the terminal opens but nothing runs. The fallback timeout resolves the gate
 * anyway so the command still fires, mirroring how editor shell integrations
 * give up waiting for the marker.
 */

/**
 * Shell readiness lifecycle:
 * - `pending`     — shell initialising; scanner active
 * - `ready`       — OSC 133;A detected (or fallback timeout fired); scanner off
 * - `unsupported` — launch config has no marker; scanner never started
 * - `cancelled`   — session ended before readiness; queued automation cancelled
 */
export type ShellReadyState = "pending" | "ready" | "unsupported" | "cancelled";

/**
 * How long to wait for the OSC 133;A prompt marker before assuming the shell is
 * ready anyway. Long enough for a slow login shell + startup hooks to reach the
 * first prompt, short enough that a preset command isn't left hanging for the
 * whole session when the marker never comes.
 */
export const SHELL_READY_FALLBACK_TIMEOUT_MS = 5_000;

export interface ShellReadyGate {
	/** Current lifecycle state. Queued writes are gated on `!== "cancelled"`. */
	getState(): ShellReadyState;
	/**
	 * Resolves once the shell is ready to accept queued input — via the prompt
	 * marker, the fallback timeout, or immediately for adopted/unsupported
	 * shells. Also resolves on `cancel()`; callers must re-check `getState()`.
	 */
	readonly promise: Promise<void>;
	/** Prompt marker (or fallback timeout) observed — release queued input. */
	markReady(): void;
	/** Session ended before readiness — release waiters without running input. */
	cancel(): void;
}

export interface CreateShellReadyGateOptions {
	/**
	 * Whether the launch config installs the OSC 133;A marker. When false the
	 * gate resolves immediately (no marker will ever arrive to wait for).
	 */
	supportsMarker: boolean;
	/** Adopted sessions are already past startup — treat as ready, not unsupported. */
	isAdopted?: boolean;
	/**
	 * Fallback delay before assuming readiness when the marker never arrives.
	 * A non-finite or non-positive value disables the fallback (used in tests to
	 * reproduce the original "waits forever" behaviour).
	 */
	fallbackTimeoutMs?: number;
	/** Injectable for deterministic tests. Defaults to `setTimeout`. */
	setTimer?: (callback: () => void, ms: number) => unknown;
	/** Injectable for deterministic tests. Defaults to `clearTimeout`. */
	clearTimer?: (handle: unknown) => void;
}

export function createShellReadyGate({
	supportsMarker,
	isAdopted = false,
	fallbackTimeoutMs = SHELL_READY_FALLBACK_TIMEOUT_MS,
	setTimer = (callback, ms) => setTimeout(callback, ms),
	clearTimer = (handle) =>
		clearTimeout(handle as ReturnType<typeof setTimeout>),
}: CreateShellReadyGateOptions): ShellReadyGate {
	if (!supportsMarker) {
		// Nothing to wait for: adopted shells already ran their startup, and
		// unwrapped shells never emit the marker.
		const state: ShellReadyState = isAdopted ? "ready" : "unsupported";
		return {
			getState: () => state,
			promise: Promise.resolve(),
			markReady() {},
			cancel() {},
		};
	}

	let state: ShellReadyState = "pending";
	let resolve: (() => void) | null = null;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	let timer: unknown = null;

	const settle = (next: "ready" | "cancelled") => {
		if (state !== "pending") return;
		state = next;
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
		if (resolve) {
			resolve();
			resolve = null;
		}
	};

	if (Number.isFinite(fallbackTimeoutMs) && fallbackTimeoutMs > 0) {
		timer = setTimer(() => {
			timer = null;
			settle("ready");
		}, fallbackTimeoutMs);
	}

	return {
		getState: () => state,
		promise,
		markReady: () => settle("ready"),
		cancel: () => settle("cancelled"),
	};
}
