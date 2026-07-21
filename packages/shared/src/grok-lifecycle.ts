export const GROK_PERMISSION_DEBOUNCE_MS = 250;

export type GrokLifecycleEventType =
	| "Attached"
	| "Detached"
	| "Start"
	| "Stop"
	| "PermissionRequest"
	| "Failed";

export interface GrokLifecycleInput {
	key: string;
	eventType: string;
	notificationType?: string;
	sessionId?: string;
}

interface PermissionState {
	emitted: boolean;
	timer: ReturnType<typeof setTimeout> | undefined;
}

interface SessionState {
	activeTurn: boolean;
	permission: PermissionState | undefined;
	sessionId: string | undefined;
}

export type GrokLifecycleEmitter = (eventType: GrokLifecycleEventType) => void;

function normalizeEventType(eventType: string): string {
	return eventType
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/-/g, "_")
		.toLowerCase();
}

function normalizeOptional(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Converts Grok's native hook stream into Superset lifecycle events.
 *
 * This adapter is deliberately Grok-specific. Grok 0.2.106 emits the same
 * `notification(permission_prompt)` for an automatically allowed read and a
 * real user-facing permission wait. Observed automatic reads reached
 * `post_tool_use` in about 20 ms, so permission is exposed only after a short
 * debounce and is cancelled by a resolving event.
 *
 * Grok also emits no distinct "permission approved" hook. After approval,
 * Superset therefore cannot leave PermissionRequest until Grok emits
 * `post_tool_use` (which may be after a long-running tool finishes). Keeping
 * that limitation here documents why there is no earlier Start transition.
 */
export class GrokLifecycleInterpreter {
	private readonly states = new Map<string, SessionState>();

	constructor(
		private readonly permissionDebounceMs = GROK_PERMISSION_DEBOUNCE_MS,
	) {}

	handle(input: GrokLifecycleInput, emit: GrokLifecycleEmitter): boolean {
		const eventType = normalizeEventType(input.eventType);
		const sessionId = normalizeOptional(input.sessionId);
		const existing = this.states.get(input.key);

		if (existing?.sessionId && sessionId && existing.sessionId !== sessionId) {
			this.clear(input.key);
		}

		switch (eventType) {
			case "session_start": {
				this.clear(input.key);
				this.states.set(input.key, {
					activeTurn: false,
					permission: undefined,
					sessionId,
				});
				emit("Attached");
				return true;
			}
			case "session_end":
				this.clear(input.key);
				emit("Detached");
				return true;
			case "user_prompt_submit": {
				const state = this.getOrCreateState(input.key, sessionId);
				this.clearPermission(state);
				state.activeTurn = true;
				emit("Start");
				return true;
			}
			case "notification": {
				const notificationType = normalizeEventType(
					input.notificationType ?? "",
				);
				if (notificationType !== "permission_prompt") return true;

				const state = this.states.get(input.key);
				if (!state?.activeTurn) return true;

				this.clearPermission(state);
				const permission: PermissionState = {
					emitted: false,
					timer: undefined,
				};
				state.permission = permission;
				permission.timer = setTimeout(() => {
					const current = this.states.get(input.key);
					if (current?.activeTurn && current.permission === permission) {
						permission.timer = undefined;
						permission.emitted = true;
						emit("PermissionRequest");
					}
				}, this.permissionDebounceMs);
				return true;
			}
			case "post_tool_use":
			case "post_tool_use_failure": {
				const state = this.states.get(input.key);
				if (!state?.activeTurn) return true;
				this.clearPermission(state);
				emit("Start");
				return true;
			}
			case "permission_denied": {
				const state = this.states.get(input.key);
				if (!state?.activeTurn) return true;
				const permissionWasEmitted = state.permission?.emitted === true;
				this.clearPermission(state);
				if (permissionWasEmitted) emit("Start");
				return true;
			}
			case "stop": {
				const state = this.getOrCreateState(input.key, sessionId);
				this.clearPermission(state);
				state.activeTurn = false;
				emit("Stop");
				return true;
			}
			case "stop_failure": {
				const state = this.getOrCreateState(input.key, sessionId);
				this.clearPermission(state);
				state.activeTurn = false;
				emit("Failed");
				return true;
			}
			default:
				return false;
		}
	}

	clear(key: string): void {
		const state = this.states.get(key);
		if (state) this.clearPermission(state);
		this.states.delete(key);
	}

	dispose(): void {
		for (const key of this.states.keys()) this.clear(key);
	}

	private getOrCreateState(
		key: string,
		sessionId: string | undefined,
	): SessionState {
		const existing = this.states.get(key);
		if (existing) {
			if (sessionId) existing.sessionId = sessionId;
			return existing;
		}

		const state: SessionState = {
			activeTurn: false,
			permission: undefined,
			sessionId,
		};
		this.states.set(key, state);
		return state;
	}

	private clearPermission(state: SessionState): void {
		if (state.permission?.timer) clearTimeout(state.permission.timer);
		state.permission = undefined;
	}
}
