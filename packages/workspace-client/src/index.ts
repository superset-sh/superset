export { useEventBus } from "./hooks/useEventBus";
export { useGitChangeEvents } from "./hooks/useGitChangeEvents";
export {
	type AgentIdentity,
	type AgentLifecyclePayload,
	type EventBusHandle,
	type GitChangedPayload,
	getEventBus,
	type HostConnectionState,
	type HostConnectionStatus,
	type PortChangedPayload,
	type ProjectChangedPayload,
	type ProjectSnapshotPayload,
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
