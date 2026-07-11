import type { SessionsApi } from "@superset/session-protocol";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { authClient, getJwt, setJwt } from "../auth/client";
import { env } from "../env";
import { buildSessionStreamUrl } from "./session-stream-url";

export { buildSessionStreamUrl } from "./session-stream-url";

type RpcQuery<TInput, TOutput> = {
	query(input: TInput): Promise<TOutput>;
};

type RpcMutation<TInput, TOutput> = {
	mutate(input: TInput): Promise<TOutput>;
};

type InputOf<TMethod> = TMethod extends (
	input: infer TInput,
) => Promise<unknown>
	? TInput
	: never;

type OutputOf<TMethod> = TMethod extends (
	input: never,
) => Promise<infer TOutput>
	? TOutput
	: never;

interface SessionsRpcClient {
	sessions: {
		create: RpcMutation<
			InputOf<SessionsApi["create"]>,
			OutputOf<SessionsApi["create"]>
		>;
		retry: RpcMutation<
			InputOf<SessionsApi["retry"]>,
			OutputOf<SessionsApi["retry"]>
		>;
		get: RpcQuery<InputOf<SessionsApi["get"]>, OutputOf<SessionsApi["get"]>>;
		list: RpcQuery<
			NonNullable<InputOf<SessionsApi["list"]>>,
			OutputOf<SessionsApi["list"]>
		>;
		getMessages: RpcQuery<
			InputOf<SessionsApi["getMessages"]>,
			OutputOf<SessionsApi["getMessages"]>
		>;
		sendMessage: RpcMutation<
			InputOf<SessionsApi["sendMessage"]>,
			OutputOf<SessionsApi["sendMessage"]>
		>;
		respondToPermission: RpcMutation<
			InputOf<SessionsApi["respondToPermission"]>,
			OutputOf<SessionsApi["respondToPermission"]>
		>;
		respondToUserDialog: RpcMutation<
			InputOf<SessionsApi["respondToUserDialog"]>,
			OutputOf<SessionsApi["respondToUserDialog"]>
		>;
		respondToElicitation: RpcMutation<
			InputOf<SessionsApi["respondToElicitation"]>,
			OutputOf<SessionsApi["respondToElicitation"]>
		>;
		interrupt: RpcMutation<
			InputOf<SessionsApi["interrupt"]>,
			OutputOf<SessionsApi["interrupt"]>
		>;
		setModel: RpcMutation<
			InputOf<SessionsApi["setModel"]>,
			OutputOf<SessionsApi["setModel"]>
		>;
		setPermissionMode: RpcMutation<
			InputOf<SessionsApi["setPermissionMode"]>,
			OutputOf<SessionsApi["setPermissionMode"]>
		>;
		getCatalog: RpcQuery<
			InputOf<SessionsApi["getCatalog"]>,
			OutputOf<SessionsApi["getCatalog"]>
		>;
	};
}

const clientCache = new Map<string, SessionsApi>();

function encodedRelayHostUrl(
	organizationId: string,
	hostId: string,
	relayUrl = env.EXPO_PUBLIC_RELAY_URL,
): string {
	const normalizedRelayUrl = relayUrl.replace(/\/$/, "");
	const routingKey = encodeURIComponent(`${organizationId}:${hostId}`);
	return `${normalizedRelayUrl}/hosts/${routingKey}`;
}

export async function getHostAuthToken(options?: {
	forceRefresh?: boolean;
}): Promise<string> {
	if (!options?.forceRefresh) {
		const cached = getJwt();
		if (cached) return cached;
	}

	const result = await authClient.token();
	const token = result.data?.token;
	if (!token) {
		throw new Error("Not signed in: no JWT available for host access");
	}
	setJwt(token);
	return token;
}

const fetchWithAuthRetry: typeof fetch = async (input, init) => {
	const response = await globalThis.fetch(input, init);
	if (response.status !== 401) return response;

	const token = await getHostAuthToken({ forceRefresh: true });
	const headers = new Headers(init?.headers);
	headers.set("authorization", `Bearer ${token}`);
	return globalThis.fetch(input, { ...init, headers });
};

/**
 * SDK-aligned session RPCs over the existing mobile -> relay -> host tunnel.
 * The facade keeps the host router out of the RN runtime while preserving the
 * neutral session-protocol types at the boundary.
 */
export function createHostSessionsApi(params: {
	organizationId: string;
	hostId: string;
}): SessionsApi {
	const hostUrl = encodedRelayHostUrl(params.organizationId, params.hostId);
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	// biome-ignore lint/suspicious/noExplicitAny: retyped immediately to the neutral RPC facade above.
	const rpc = createTRPCProxyClient<any>({
		links: [
			httpLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				async headers() {
					const token = await getHostAuthToken();
					return { authorization: `Bearer ${token}` };
				},
				fetch: fetchWithAuthRetry,
			}),
		],
	}) as unknown as SessionsRpcClient;

	const api: SessionsApi = {
		create: (input) => rpc.sessions.create.mutate(input),
		retry: (input) => rpc.sessions.retry.mutate(input),
		get: (input) => rpc.sessions.get.query(input),
		list: (input) => rpc.sessions.list.query(input ?? {}),
		getMessages: (input) => rpc.sessions.getMessages.query(input),
		sendMessage: (input) => rpc.sessions.sendMessage.mutate(input),
		respondToPermission: (input) =>
			rpc.sessions.respondToPermission.mutate(input),
		respondToUserDialog: (input) =>
			rpc.sessions.respondToUserDialog.mutate(input),
		respondToElicitation: (input) =>
			rpc.sessions.respondToElicitation.mutate(input),
		interrupt: (input) => rpc.sessions.interrupt.mutate(input),
		setModel: (input) => rpc.sessions.setModel.mutate(input),
		setPermissionMode: (input) => rpc.sessions.setPermissionMode.mutate(input),
		getCatalog: (input) => rpc.sessions.getCatalog.query(input),
	};
	clientCache.set(hostUrl, api);
	return api;
}

/** Refreshes authentication for every socket attempt, including reconnects. */
export function createSessionStreamUrlFactory(options: {
	organizationId: string;
	hostId: string;
	sessionId: string;
}): () => Promise<string> {
	return async () =>
		buildSessionStreamUrl({
			...options,
			relayUrl: env.EXPO_PUBLIC_RELAY_URL,
			token: await getHostAuthToken({ forceRefresh: true }),
		});
}
