/**
 * Cloud-registration state for this host-service instance.
 *
 * `host.ensure` is the only thing that makes this host visible server-side
 * (hosts list, automations, relay routing). When it fails the service keeps
 * serving locally and looks healthy, so the failure must be queryable —
 * health.check exposes this state and `superset status` reports it
 * (issue #6415).
 */
export type RegistrationState = {
	registered: boolean;
	lastError: string | null;
	lastAttemptAt: number | null;
};

const state: RegistrationState = {
	registered: false,
	lastError: null,
	lastAttemptAt: null,
};

export function getRegistrationState(): RegistrationState {
	return { ...state };
}

export function recordRegistrationSuccess(): void {
	state.registered = true;
	state.lastError = null;
	state.lastAttemptAt = Date.now();
}

export function recordRegistrationFailure(error: unknown): void {
	state.registered = false;
	state.lastError = error instanceof Error ? error.message : String(error);
	state.lastAttemptAt = Date.now();
}
