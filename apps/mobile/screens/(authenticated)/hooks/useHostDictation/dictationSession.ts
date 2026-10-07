export interface DictationTarget {
	machineId: string;
	hostUrl: string;
	hostName: string;
}

export interface DictationAudio {
	uri: string;
	durationMs: number;
}

type Snapshot =
	| { status: "idle" }
	| {
			status: "transcribing" | "failed";
			audio: DictationAudio;
			target: DictationTarget;
			error?: unknown;
	  };

export function dictationEngineFor(
	target: DictationTarget | null,
	settings: {
		data: { enabled: boolean; installed: boolean } | undefined;
		isPending: boolean;
	},
): "apple" | "file" | "waiting" {
	if (!target) return "apple";
	if (settings.isPending || !settings.data) return "waiting";
	return settings.data.enabled && settings.data.installed ? "file" : "apple";
}

export function createDictationSession(dependencies: {
	transcribe: (
		audio: DictationAudio,
		target: DictationTarget,
	) => Promise<string>;
	append: (text: string) => void | Promise<void>;
	remove: (uri: string) => void;
}) {
	let state: Snapshot = { status: "idle" };
	const listeners = new Set<() => void>();
	let running = false;
	let invalidated = false;
	const publish = (next: Snapshot) => {
		state = next;
		for (const listener of listeners) listener();
	};
	const remove = (uri: string) => {
		try {
			dependencies.remove(uri);
		} catch {}
	};
	const retry = async () => {
		if (invalidated || running || state.status === "idle") return;
		running = true;
		const pending = state;
		publish({ ...pending, status: "transcribing", error: undefined });
		try {
			const text = await dependencies.transcribe(pending.audio, pending.target);
			if (invalidated) return;
			if (text.trim()) await dependencies.append(text);
			if (invalidated) return;
			remove(pending.audio.uri);
			publish({ status: "idle" });
		} catch (error) {
			if (!invalidated) publish({ ...pending, status: "failed", error });
		} finally {
			running = false;
		}
	};
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		accept: (audio: DictationAudio, target: DictationTarget) => {
			if (invalidated) {
				remove(audio.uri);
				return;
			}
			if (state.status !== "idle") return;
			publish({ status: "transcribing", audio, target });
			void retry();
		},
		invalidate: () => {
			invalidated = true;
			if (state.status !== "idle") remove(state.audio.uri);
			publish({ status: "idle" });
		},
		retry,
		abandon: () => {
			if (invalidated || running || state.status === "idle") return;
			remove(state.audio.uri);
			publish({ status: "idle" });
		},
	};
}

export function dictationScopeKey(
	accountId: string | null,
	organizationId: string | null,
): string {
	return JSON.stringify([accountId, organizationId]);
}

export function createDictationSessionRegistry() {
	let scope = "";
	const sessions = new Map<string, ReturnType<typeof createDictationSession>>();
	return {
		setScope: (next: string) => {
			if (scope === next) return;
			scope = next;
			for (const session of sessions.values()) session.invalidate();
			sessions.clear();
		},
		get: (
			draftKey: string,
			create: (key: string) => ReturnType<typeof createDictationSession>,
		) => {
			const key = JSON.stringify([scope, draftKey]);
			let session = sessions.get(key);
			if (!session) {
				session = create(key);
				sessions.set(key, session);
			}
			return { key, session };
		},
	};
}
