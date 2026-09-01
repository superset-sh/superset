export { useEventBus } from "./hooks/useEventBus";
export { useGitChangeEvents } from "./hooks/useGitChangeEvents";
export {
	type AgentBindingsChangedPayload,
	type AgentIdentity,
	type AgentLifecyclePayload,
	type EventBusHandle,
	type GitChangedPayload,
	getEventBus,
	type HostConnectionState,
	type HostConnectionStatus,
	type PageWatchChangedPayload,
	type PortChangedPayload,
	type ProjectChangedPayload,
	type ProjectSnapshotPayload,
	reconnectEventBusIfDown,
	type TerminalLifecyclePayload,
	type WorkspaceChangedPayload,
	type WorkspaceCreateSettledPayload,
	type WorkspaceSnapshotPayload,
} from "./lib/eventBus";
export {
	primeRelayAffinity,
	type RelayAffinityProbe,
} from "./lib/primeRelayAffinity";
export {
	createRelaySocket,
	type RelaySocket,
	type RelaySocketOptions,
} from "./lib/relaySocket";
export {
	useMaybeWorkspaceClient,
	useWorkspaceClient,
	useWorkspaceHostUrl,
	useWorkspaceWsUrl,
	type WorkspaceClientContextValue,
	WorkspaceClientProvider,
} from "./providers/WorkspaceClientProvider";
export { workspaceTrpc } from "./workspace-trpc";
