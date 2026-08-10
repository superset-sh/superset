import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import superjson from "superjson";

type TrpcErrorCode =
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "SERVICE_UNAVAILABLE"
	| "BAD_GATEWAY";

const RPC_CODE: Record<TrpcErrorCode, number> = {
	UNAUTHORIZED: -32001,
	FORBIDDEN: -32003,
	SERVICE_UNAVAILABLE: -32603,
	BAD_GATEWAY: -32603,
};

const HTTP_STATUS: Record<TrpcErrorCode, ContentfulStatusCode> = {
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	SERVICE_UNAVAILABLE: 503,
	BAD_GATEWAY: 502,
};

export function isTrpcPath(pathAfterHost: string): boolean {
	return pathAfterHost.startsWith("/trpc");
}

export function trpcErrorResponse(
	c: Context,
	code: TrpcErrorCode,
	message: string,
) {
	const httpStatus = HTTP_STATUS[code];
	const error = superjson.serialize({
		message,
		code: RPC_CODE[code],
		data: { code, httpStatus },
	});
	return c.json({ error }, httpStatus);
}
