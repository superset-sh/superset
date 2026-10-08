import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import superjson from "superjson";

type TrpcErrorCode =
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "INTERNAL_SERVER_ERROR"
	| "SERVICE_UNAVAILABLE"
	| "BAD_GATEWAY";

const RPC_CODE: Record<TrpcErrorCode, number> = {
	UNAUTHORIZED: -32001,
	FORBIDDEN: -32003,
	INTERNAL_SERVER_ERROR: -32603,
	SERVICE_UNAVAILABLE: -32603,
	BAD_GATEWAY: -32603,
};

const HTTP_STATUS: Record<TrpcErrorCode, ContentfulStatusCode> = {
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503,
	BAD_GATEWAY: 502,
};

type ErrorShape = {
	message: string;
	code: number;
	data: { code: TrpcErrorCode; httpStatus: ContentfulStatusCode };
};

export type HostTrpcRouter = {
	prefix: string;
	encode: (shape: ErrorShape) => unknown;
};

/** The host's main router uses superjson; its chat router has no transformer. */
export const HOST_TRPC_ROUTERS: readonly HostTrpcRouter[] = [
	{ prefix: "/trpc", encode: (shape) => superjson.serialize(shape) },
	{ prefix: "/chat-v3/trpc", encode: (shape) => shape },
];

export function hostTrpcRouter(
	pathAfterHost: string,
): HostTrpcRouter | undefined {
	return HOST_TRPC_ROUTERS.find(({ prefix }) =>
		pathAfterHost.startsWith(`${prefix}/`),
	);
}

export function trpcErrorResponse(
	c: Context,
	router: HostTrpcRouter,
	code: TrpcErrorCode,
	message: string,
) {
	const httpStatus = HTTP_STATUS[code];
	const shape = { message, code: RPC_CODE[code], data: { code, httpStatus } };
	return c.json({ error: router.encode(shape) }, httpStatus);
}
