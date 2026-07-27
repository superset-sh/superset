import { describe, expect, test } from "bun:test";
import type {
	SessionStreamState,
	SessionsSyncClient,
	SessionsSyncState,
} from "@superset/host-service-sync/client";
import type {
	Session,
	SessionEvent,
} from "@superset/host-service-sync/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { createStore } from "zustand/vanilla";
import { SessionsSyncProvider } from "./context";
import { useSession, useSessionsList } from "./hooks";
import { useSessionTimeline } from "./useSessionTimeline";

const SESSION_ID = "session-1";

function makeSession(): Session {
	return {
		id: SESSION_ID,
		workspaceId: "workspace-1",
		title: "Greeting",
		mainThreadId: `${SESSION_ID}:main`,
		agent: { id: "claude-code", displayName: "Claude Code" },
		runState: "idle",
		capabilities: {
			threadModel: "nested",
			threadFidelity: "partial",
			canResume: true,
			supportsPermissions: true,
			supportsModes: true,
			supportsModels: true,
		},
		settings: {
			activeModel: null,
			activeMode: null,
			effort: null,
			configuration: {},
		},
		settingOptions: [],
		eventHead: "cursor-2",
		createdAt: 1_000,
		updatedAt: 1_001,
		lastActivityAt: 1_001,
		archivedAt: null,
		closedAt: null,
		error: null,
	};
}

function makeEvents(): SessionEvent[] {
	return [
		{
			id: "event-1",
			sessionId: SESSION_ID,
			threadId: `${SESSION_ID}:main`,
			cursor: "cursor-1",
			occurredAt: 1_000,
			causationId: null,
			payload: {
				type: "messageStarted",
				message: {
					id: "m-user",
					sessionId: SESSION_ID,
					threadId: `${SESSION_ID}:main`,
					turnId: "turn-1",
					role: "user",
					content: [{ type: "text", text: "say hi" }],
					createdAt: 1_000,
				},
			},
		},
	];
}

function makeState(): SessionsSyncState {
	const events = makeEvents();
	const stream: SessionStreamState = {
		status: "live",
		latestCursor: "cursor-1",
		oldestCursor: "cursor-1",
		hasOlder: false,
		eventIds: events.map((event) => event.id),
		eventsById: Object.fromEntries(events.map((event) => [event.id, event])),
		estimatedEventBytes: 0,
		retainCount: 1,
		retention: "focused",
		lastAccessedAt: 1_001,
		error: null,
	};
	return {
		connection: {
			status: "connected",
			hostId: "host-1",
			connectionId: "conn-1",
			error: null,
		},
		hostSubscription: { status: "live", latestCursor: "cursor-1" },
		sessionsById: { [SESSION_ID]: makeSession() },
		sessionOrder: [SESSION_ID],
		threadsById: {},
		pendingPermissionsById: {},
		clientToolCallsById: {},
		streamsBySessionId: { [SESSION_ID]: stream },
		totalEstimatedEventBytes: 0,
	};
}

function makeClient(): SessionsSyncClient {
	return {
		store: createStore<SessionsSyncState>(() => makeState()),
		connect: () => {},
		disconnect: () => {},
		retainSession: () => () => {},
		fetchOlderEvents: () => Promise.resolve(),
		registerToolResolver: () => () => {},
		resolveToolCall: () => Promise.resolve(),
	};
}

function Probe() {
	const sessions = useSessionsList();
	const session = useSession(SESSION_ID);
	const timeline = useSessionTimeline(SESSION_ID);
	const first = timeline.items[0];
	return (
		<div>
			<span data-testid="count">{sessions.length}</span>
			<span data-testid="title">{session?.title}</span>
			<span data-testid="item">
				{first?.kind === "message" && first.blocks[0]?.type === "text"
					? `${first.role}:${first.blocks[0].text}`
					: "none"}
			</span>
		</div>
	);
}

describe("host-service-react bindings", () => {
	test("hooks read sessions and folded timeline through the provider", () => {
		const markup = renderToStaticMarkup(
			<SessionsSyncProvider client={makeClient()}>
				<Probe />
			</SessionsSyncProvider>,
		);
		expect(markup).toContain(">1<");
		expect(markup).toContain(">Greeting<");
		expect(markup).toContain(">user:say hi<");
	});

	test("useSessionsSyncClient throws without a provider", () => {
		expect(() => renderToStaticMarkup(<Probe />)).toThrow(
			/SessionsSyncProvider/,
		);
	});
});
