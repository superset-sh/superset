export type MiddlewareFn = (opts: {
	options: Record<string, unknown>;
	commandPath: string[];
	next: (params: { ctx: Record<string, unknown> }) => Promise<unknown>;
}) => Promise<unknown>;

export function middleware(fn: MiddlewareFn): MiddlewareFn {
	return fn;
}
