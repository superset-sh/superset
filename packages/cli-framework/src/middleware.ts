export const skip = Symbol("skip");
export type Skip = typeof skip;

export type MiddlewareFn = (opts: {
	options: Record<string, unknown>;
	next: (params: { ctx: Record<string, unknown> }) => Promise<unknown>;
}) => Promise<unknown>;

export type MiddlewareExport = MiddlewareFn | Skip;

export function middleware(fn: MiddlewareFn): MiddlewareFn {
	return fn;
}
