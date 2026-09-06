/**
 * Cloud-registration state for this host-service instance.
 *
 * `host.ensure` is the only thing that makes this host visible server-side
 * (hosts list, automations, relay routing). When it fails the service keeps
 * serving locally and looks healthy, so the failure must be queryable —
 * health.check exposes this state and `superset status` reports it
 * (issue #6415).
 *
 * The relay is tracked separately: a host started without a relay URL
 * (Remote Access off) registers but never opens the tunnel, so it shows
 * offline and automations can't reach it. That is a deliberate setting, not
 * a failure, and `superset status` must be able to say so (issue #7223).
 */
export type RegistrationState = {
	registered: boolean;
	lastError: string | null;
	lastAttemptAt: number | null;
	/** null until registration settles; false = started without a relay URL. */
	relayEnabled: boolean | null;
};

const state: RegistrationState = {
	registered: false,
	lastError: null,
	lastAttemptAt: null,
	relayEnabled: null,
};

export function getRegistrationState(): RegistrationState {
	return { ...state };
}

export function recordRegistrationSuccess(options: {
	relayEnabled: boolean;
}): void {
	state.registered = true;
	state.lastError = null;
	state.lastAttemptAt = Date.now();
	state.relayEnabled = options.relayEnabled;
}

export function recordRegistrationFailure(error: unknown): void {
	state.registered = false;
	state.lastError = error instanceof Error ? error.message : String(error);
	state.lastAttemptAt = Date.now();
}
