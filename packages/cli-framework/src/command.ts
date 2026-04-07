import type { GenericBuilderInternals, TypeOf } from "./option";

export type CommandResult =
	| { data?: unknown; message?: string }
	| unknown[]
	| undefined;

export type CommandConfig<
	TOpts extends Record<string, GenericBuilderInternals> = Record<string, never>,
	TArgs extends GenericBuilderInternals[] = [],
> = {
	description: string;
	options?: TOpts;
	args?: TArgs;
	display?: (data: unknown) => string;
	run: (opts: {
		options: TypeOf<TOpts>;
		args: InferArgs<TArgs>;
		ctx: Record<string, unknown>;
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

export function command<
	TOpts extends Record<string, GenericBuilderInternals>,
	TArgs extends GenericBuilderInternals[],
>(config: CommandConfig<TOpts, TArgs>): CommandConfig<TOpts, TArgs> {
	return config;
}
