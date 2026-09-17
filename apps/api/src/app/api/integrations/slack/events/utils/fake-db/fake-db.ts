export interface FakeDbCall {
	method: string;
	args: unknown[];
}

type RootMethod = "insert" | "update" | "delete" | "select";

/**
 * A drizzle-shaped stand-in for unit tests: builder methods chain, awaiting a
 * chain resolves to whatever `results[<root method>]` holds at that moment,
 * and every call is recorded for assertions.
 */
export function fakeDb(options: { query?: Record<string, unknown> } = {}) {
	const calls: FakeDbCall[] = [];
	const results: Partial<Record<RootMethod, unknown>> = {};
	const root =
		(method: RootMethod) =>
		(...args: unknown[]) => {
			calls.push({ method, args });
			const chain: Record<string | symbol, unknown> = new Proxy(
				{} as Record<string | symbol, unknown>,
				{
					get(_target, prop) {
						if (prop === "then") {
							return (resolve: (value: unknown) => void) =>
								resolve(results[method]);
						}
						return (...chainArgs: unknown[]) => {
							calls.push({
								method: `${method}.${String(prop)}`,
								args: chainArgs,
							});
							return chain;
						};
					},
				},
			);
			return chain;
		};
	return {
		db: {
			insert: root("insert"),
			update: root("update"),
			delete: root("delete"),
			select: root("select"),
			query: options.query ?? {},
		},
		calls,
		results,
		callsTo: (method: string) => calls.filter((call) => call.method === method),
	};
}
