export { useEventBus } from "./hooks/useEventBus";
export { useGitChangeEvents } from "./hooks/useGitChangeEvents";
export {
	type AgentIdentity,
	type AgentLifecyclePayload,
	type EventBusHandle,
	type GitChangedPayload,
	getEventBus,
	type PortChangedPayload,
	type TerminalLifecyclePayload,
	type WorkspaceChangedPayload,
	type WorkspaceSnapshotPayload,
} from "./lib/eventBus";
export {
	primeRelayAffinity,
	type RelayAffinityProbe,
} from "./lib/primeRelayAffinity";
export {
	useWorkspaceClient,
	useWorkspaceHostUrl,
	useWorkspaceWsUrl,
	type WorkspaceClientContextValue,
	WorkspaceClientProvider,
} from "./providers/WorkspaceClientProvider";
export { workspaceTrpc } from "./workspace-trpc";
