import type { Envelope } from "@superset/chat/protocol";
import type { HarnessAdapter } from "../../harness";
import type { ChatJournal } from "../../journal";
import { LiveSession } from "../liveSession";

export type HarnessFactoryOptions = {
	sessionId: string;
	scopeId: string;
	harness: string;
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
	terminalId?: string;
};

export type HarnessFactory = (options: HarnessFactoryOptions) => HarnessAdapter;

export type HarnessRegistry = Map<string, HarnessFactory>;

export type LiveSessionObserver = {
	started(options: HarnessFactoryOptions): void;
	published(envelope: Envelope, session: LiveSession): void;
	stopped(sessionId: string): void;
};

export type LiveSessionRegistryOptions = {
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	harnesses: HarnessRegistry;
	observer?: LiveSessionObserver;
	mintId?: () => string;
	now?: () => number;
};

export class LiveSessionRegistry {
	private readonly live = new Map<string, LiveSession>();

	constructor(private readonly options: LiveSessionRegistryOptions) {}

	supports(harness: string): boolean {
		return this.options.harnesses.has(harness);
	}

	create(options: HarnessFactoryOptions): LiveSession {
		const factory = this.options.harnesses.get(options.harness);
		if (!factory) throw new Error(`unknown harness ${options.harness}`);
		if (this.live.has(options.sessionId)) {
			throw new Error(`chat session ${options.sessionId} is already running`);
		}

		const observer = this.options.observer;
		const session = new LiveSession({
			sessionId: options.sessionId,
			scopeId: options.scopeId,
			harness: options.harness,
			terminalId: options.terminalId,
			journal: this.options.journal,
			publish: (envelope) => {
				this.options.publish(envelope);
				this.observe(() => observer?.published(envelope, session));
			},
			adapter: factory(options),
			mintId: this.options.mintId,
			now: this.options.now,
		});
		this.live.set(options.sessionId, session);
		this.observe(() => observer?.started(options));
		try {
			session.start({
				cwd: options.cwd,
				modeId: options.modeId,
				modelId: options.modelId,
				resume: options.resume,
			});
		} catch (error) {
			this.live.delete(options.sessionId);
			this.observe(() => observer?.stopped(options.sessionId));
			void session.dispose().catch(() => undefined);
			throw error;
		}
		return session;
	}

	private observe(notify: () => void): void {
		try {
			notify();
		} catch (error) {
			console.warn("[chat-runtime] session observer failed", error);
		}
	}

	get(sessionId: string): LiveSession | null {
		return this.live.get(sessionId) ?? null;
	}

	require(sessionId: string): LiveSession {
		const session = this.live.get(sessionId);
		if (!session) throw new Error(`chat session ${sessionId} is not running`);
		return session;
	}

	async dispose(sessionId: string): Promise<void> {
		const session = this.live.get(sessionId);
		if (!session) return;
		this.live.delete(sessionId);
		this.observe(() => this.options.observer?.stopped(sessionId));
		await session.dispose();
	}

	async disposeAll(): Promise<void> {
		const sessions = [...this.live.values()];
		this.live.clear();
		for (const session of sessions) {
			this.observe(() => this.options.observer?.stopped(session.sessionId));
		}
		const results = await Promise.allSettled(
			sessions.map((session) => session.dispose()),
		);
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
	}
}
