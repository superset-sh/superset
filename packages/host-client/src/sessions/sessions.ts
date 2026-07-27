import type { SessionsSyncApi } from "@superset/host-service-sync/client";
import type {
	CancelTurnInput,
	CancelTurnReceipt,
	CreateSessionInput,
	CreateSessionResult,
	HostSnapshot,
	ResolvePermissionInput,
	ResolvePermissionReceipt,
	SubmitTurnInput,
	SubmitTurnReceipt,
	UpdateSessionInput,
	UpdateSessionReceipt,
} from "@superset/host-service-sync/protocol";
import type { HostTransport } from "../transport";

/**
 * Canonical sessions surface of a host (plans/host-sessions-sync.md), bound
 * to a transport. Inputs/outputs are typed via @superset/host-service-sync —
 * the same contracts the host's `sessions.*` router implements — so clients
 * never import the host's own modules. The read plane lives in the sync
 * client (`syncApi` + `syncUrl` feed `createSessionsSyncClient`); the
 * methods here are the command plane.
 */
export interface SessionsHostClient {
	list(routingKey: string): Promise<HostSnapshot>;
	create(
		routingKey: string,
		input: CreateSessionInput,
	): Promise<CreateSessionResult>;
	update(
		routingKey: string,
		input: UpdateSessionInput,
	): Promise<UpdateSessionReceipt>;
	submitTurn(
		routingKey: string,
		input: SubmitTurnInput,
	): Promise<SubmitTurnReceipt>;
	cancelTurn(
		routingKey: string,
		input: CancelTurnInput,
	): Promise<CancelTurnReceipt>;
	resolvePermission(
		routingKey: string,
		input: ResolvePermissionInput,
	): Promise<ResolvePermissionReceipt>;
	/** Query facade for one host, shaped for createSessionsSyncClient. */
	syncApi(routingKey: string): SessionsSyncApi;
	/** WS URL factory for the host's `/sessions/sync` stream. */
	syncUrl(routingKey: string): () => Promise<string>;
}

export function createSessionsHostClient(
	transport: HostTransport,
): SessionsHostClient {
	const call = <TOutput>(
		routingKey: string,
		procedure: string,
		input: unknown,
		method: "GET" | "POST",
	) => transport.call<TOutput>({ routingKey, procedure, input, method });

	return {
		list: (routingKey) => call(routingKey, "sessions.list", undefined, "GET"),
		create: (routingKey, input) =>
			call(routingKey, "sessions.create", input, "POST"),
		update: (routingKey, input) =>
			call(routingKey, "sessions.update", input, "POST"),
		submitTurn: (routingKey, input) =>
			call(routingKey, "sessions.submitTurn", input, "POST"),
		cancelTurn: (routingKey, input) =>
			call(routingKey, "sessions.cancelTurn", input, "POST"),
		resolvePermission: (routingKey, input) =>
			call(routingKey, "sessions.resolvePermission", input, "POST"),
		syncApi: (routingKey) => ({
			list: () => call(routingKey, "sessions.list", undefined, "GET"),
			get: (input) => call(routingKey, "sessions.get", input, "GET"),
			getEvents: (input) =>
				call(routingKey, "sessions.getEvents", input, "GET"),
			resolveToolCall: (input) =>
				call(routingKey, "sessions.resolveToolCall", input, "POST"),
		}),
		syncUrl: (routingKey) =>
			transport.streamUrl({ routingKey, path: "sessions/sync" }),
	};
}
