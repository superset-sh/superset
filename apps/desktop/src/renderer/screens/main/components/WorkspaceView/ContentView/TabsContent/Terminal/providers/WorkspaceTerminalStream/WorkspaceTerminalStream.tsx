import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

// ---------------------------------------------------------------------------
// Types matching the workspace stream bus event union
// ---------------------------------------------------------------------------

interface WorkspaceStreamEventBase {
	workspaceId: string;
	sessionId: string;
	paneId: string;
	eventId: number;
	sessionSeq: number;
	ts: number;
}

type TerminalDataEvent = WorkspaceStreamEventBase & {
	type: "terminal.data";
	data: string;
};

type TerminalExitEvent = WorkspaceStreamEventBase & {
	type: "terminal.exit";
	exitCode: number;
	signal?: number;
	reason?: "killed" | "exited" | "error";
};

type TerminalErrorEvent = WorkspaceStreamEventBase & {
	type: "terminal.error";
	code?: string;
	message: string;
};

type TerminalDisconnectEvent = WorkspaceStreamEventBase & {
	type: "terminal.disconnect";
	reason: string;
};

type TerminalWatermarkEvent = {
	type: "terminal.watermark";
	workspaceId: string;
	eventId: number;
	ts: number;
};

type WorkspaceStreamEvent =
	| TerminalDataEvent
	| TerminalExitEvent
	| TerminalErrorEvent
	| TerminalDisconnectEvent
	| TerminalWatermarkEvent;

// Per-pane legacy event shape (what Terminal.tsx expects)
export type PaneStreamEvent =
	| { type: "data"; data: string }
	| {
			type: "exit";
			exitCode: number;
			signal?: number;
			reason?: "killed" | "exited" | "error";
	  }
	| { type: "disconnect"; reason: string }
	| { type: "error"; error: string; code?: string };

type PaneListener = (event: PaneStreamEvent) => void;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface WorkspaceTerminalStreamContext {
	registerPane: (paneId: string, listener: PaneListener) => () => void;
}

const Ctx = createContext<WorkspaceTerminalStreamContext | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
	workspaceId: string;
	children: React.ReactNode;
}

export function WorkspaceTerminalStreamProvider({
	workspaceId,
	children,
}: Props) {
	const listenersRef = useRef(new Map<string, Set<PaneListener>>());

	const registerPane = useCallback(
		(paneId: string, listener: PaneListener): (() => void) => {
			let set = listenersRef.current.get(paneId);
			if (!set) {
				set = new Set();
				listenersRef.current.set(paneId, set);
			}
			set.add(listener);
			return () => {
				set.delete(listener);
				if (set.size === 0) {
					listenersRef.current.delete(paneId);
				}
			};
		},
		[],
	);

	const dispatchEvent = useCallback((event: WorkspaceStreamEvent) => {
		if (event.type === "terminal.watermark") return;

		const paneId = event.paneId;
		const listeners = listenersRef.current.get(paneId);
		if (!listeners || listeners.size === 0) return;

		const paneEvent = toPaneEvent(event);
		if (!paneEvent) return;

		for (const listener of listeners) {
			listener(paneEvent);
		}
	}, []);

	electronTrpc.terminal.streamWorkspace.useSubscription(
		{ workspaceId },
		{
			onData: dispatchEvent,
			onError: (error) => {
				console.error(
					"[WorkspaceTerminalStream] Subscription error:",
					error instanceof Error ? error.message : String(error),
				);
				// Broadcast disconnect to all registered panes
				const disconnectEvent: PaneStreamEvent = {
					type: "disconnect",
					reason:
						error instanceof Error
							? error.message
							: "Workspace stream connection lost",
				};
				for (const [, listeners] of listenersRef.current) {
					for (const listener of listeners) {
						listener(disconnectEvent);
					}
				}
			},
			enabled: true,
		},
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			listenersRef.current.clear();
		};
	}, []);

	return <Ctx.Provider value={{ registerPane }}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspaceTerminalStream(
	paneId: string,
	onEvent: PaneListener,
): void {
	const ctx = useContext(Ctx);
	const onEventRef = useRef(onEvent);
	onEventRef.current = onEvent;

	useEffect(() => {
		if (!ctx) return;
		const unregister = ctx.registerPane(paneId, (event) =>
			onEventRef.current(event),
		);
		return unregister;
	}, [ctx, paneId]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPaneEvent(
	event: Exclude<WorkspaceStreamEvent, TerminalWatermarkEvent>,
): PaneStreamEvent | null {
	switch (event.type) {
		case "terminal.data":
			return { type: "data", data: event.data };
		case "terminal.exit":
			return {
				type: "exit",
				exitCode: event.exitCode,
				signal: event.signal,
				reason: event.reason,
			};
		case "terminal.error":
			return { type: "error", error: event.message, code: event.code };
		case "terminal.disconnect":
			return { type: "disconnect", reason: event.reason };
		default:
			return null;
	}
}
