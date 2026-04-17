import type { GenericBuilderInternals, TypeOf } from "./option";

export type CommandResult =
	| { data?: unknown; message?: string }
	| unknown[]
	| undefined;

// When `skipMiddleware: true`, the middleware doesn't run, so `ctx` is empty.
// When false/omitted, the middleware runs and `ctx` is the app's `TContext`.
type CtxOf<TContext, TSkip extends boolean> = TSkip extends true
	? Record<string, never>
	: TContext;

export type CommandConfig<
	TContext = Record<string, unknown>,
	TOpts extends Record<string, GenericBuilderInternals> = Record<string, never>,
	TArgs extends GenericBuilderInternals[] = [],
	TSkip extends boolean = false,
> = {
	description: string;
	aliases?: string[];
	skipMiddleware?: TSkip;
	options?: TOpts;
	args?: TArgs;
	display?: (data: unknown) => string;
	run: (opts: {
		options: TypeOf<TOpts>;
		args: InferArgs<TArgs>;
		ctx: CtxOf<TContext, TSkip>;
		signal: AbortSignal;
	}) => Promise<CommandResult>;
};

// Infer args from a tuple of positional builders
type InferArgs<T extends GenericBuilderInternals[]> = T extends []
	? Record<string, never>
	: {
				[K in keyof T]: T[K] extends GenericBuilderInternals
					? { name: string; value: T[K]["_"]["$output"] }
					: never;
			} extends infer Mapped
		? Mapped extends { name: string; value: unknown }[]
			? {
					[Item in Mapped[number] as Item extends { name: string }
						? NonNullable<Item["name"]>
						: never]: Item["value"];
				}
			: Record<string, never>
		: Record<string, never>;

/**
 * Build a typed `command()` factory. `TContext` is the shape the root
 * middleware installs on `ctx`; commands that declare `skipMiddleware: true`
 * automatically get an empty `ctx` type so `opts.ctx.api` etc. is a
 * compile-time error in unauthenticated commands.
 */
export function createCommand<TContext>() {
	return function command<
		const TSkip extends boolean = false,
		TOpts extends Record<string, GenericBuilderInternals> = Record<
			string,
			never
		>,
		TArgs extends GenericBuilderInternals[] = [],
	>(
		config: CommandConfig<TContext, TOpts, TArgs, TSkip>,
	): CommandConfig<TContext, TOpts, TArgs, TSkip> {
		return config;
	};
}
