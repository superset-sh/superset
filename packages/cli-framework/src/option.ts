import { CLIError } from "./errors";

// --- Config types ---

export type OptionType = "string" | "boolean" | "number" | "positional";
export type OutputType = string | boolean | number | string[] | undefined;

export type BuilderConfig<TType extends OptionType = OptionType> = {
	name?: string;
	aliases: string[];
	type: TType;
	description?: string;
	default?: OutputType;
	isHidden?: boolean;
	isRequired?: boolean;
	isInt?: boolean;
	isVariadic?: boolean;
	minVal?: number;
	maxVal?: number;
	enumVals?: [string, ...string[]];
	envVar?: string;
	conflictsWith?: string[];
};

export type ProcessedBuilderConfig = BuilderConfig & { name: string };

// --- Builder class ---

export class OptionBuilderBase<
	TBuilderConfig extends BuilderConfig = BuilderConfig,
	TOutput extends OutputType = string,
	TOmit extends string = "",
	TEnums extends string | undefined = undefined,
> {
	public _: {
		config: TBuilderConfig;
		/** Type-level only — do not access at runtime */
		$output: TOutput;
	};

	constructor(config?: TBuilderConfig) {
		this._ = {
			config:
				config ??
				({ aliases: [], type: "string" } as unknown as TBuilderConfig),
			$output: undefined as any as TOutput,
		};
	}

	// --- Type selectors ---

	public string<TName extends string>(
		name?: TName,
	): Omit<
		OptionBuilderBase<
			BuilderConfig<"string">,
			string | undefined,
			TOmit | OptionType | "min" | "max" | "int"
		>,
		TOmit | OptionType | "min" | "max" | "int"
	> {
		return new OptionBuilderBase({
			...this._.config,
			type: "string",
			name,
		}) as any;
	}

	public number<TName extends string>(
		name?: TName,
	): Omit<
		OptionBuilderBase<
			BuilderConfig<"number">,
			number | undefined,
			TOmit | OptionType | "enum" | "variadic"
		>,
		TOmit | OptionType | "enum" | "variadic"
	> {
		return new OptionBuilderBase({
			...this._.config,
			type: "number",
			name,
		}) as any;
	}

	public boolean<TName extends string>(
		name?: TName,
	): Omit<
		OptionBuilderBase<
			BuilderConfig<"boolean">,
			boolean | undefined,
			TOmit | OptionType | "min" | "max" | "enum" | "int" | "variadic"
		>,
		TOmit | OptionType | "min" | "max" | "enum" | "int" | "variadic"
	> {
		return new OptionBuilderBase({
			...this._.config,
			type: "boolean",
			name,
		}) as any;
	}

	public positional<TName extends string>(
		displayName?: TName,
	): Omit<
		OptionBuilderBase<
			BuilderConfig<"positional">,
			string | undefined,
			TOmit | OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
		>,
		TOmit | OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
	> {
		return new OptionBuilderBase({
			...this._.config,
			type: "positional",
			name: displayName,
		}) as any;
	}

	// --- Modifiers ---

	public alias(
		...aliases: string[]
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "alias", TEnums>,
		TOmit | "alias"
	> {
		return new OptionBuilderBase({
			...this._.config,
			aliases,
		}) as any;
	}

	public desc(
		description: string,
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "desc", TEnums>,
		TOmit | "desc"
	> {
		return new OptionBuilderBase({
			...this._.config,
			description,
		}) as any;
	}

	public hidden(): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "hidden", TEnums>,
		TOmit | "hidden"
	> {
		return new OptionBuilderBase({
			...this._.config,
			isHidden: true,
		}) as any;
	}

	public required(): Omit<
		OptionBuilderBase<
			TBuilderConfig,
			Exclude<TOutput, undefined>,
			TOmit | "required" | "default",
			TEnums
		>,
		TOmit | "required" | "default"
	> {
		return new OptionBuilderBase({
			...this._.config,
			isRequired: true,
		}) as any;
	}

	public default<
		TDefVal extends TEnums extends undefined
			? Exclude<TOutput, undefined>
			: TEnums,
	>(
		value: TDefVal,
	): Omit<
		OptionBuilderBase<
			TBuilderConfig,
			Exclude<TOutput, undefined>,
			TOmit | "required" | "default",
			TEnums
		>,
		TOmit | "required" | "default"
	> {
		const config = this._.config;
		if (config.enumVals && !config.enumVals.includes(value as string)) {
			throw new CLIError(
				`Default value "${value}" is not in enum [${config.enumVals.join(", ")}]`,
			);
		}
		return new OptionBuilderBase({ ...config, default: value }) as any;
	}

	public enum<
		TValues extends [string, ...string[]],
		TUnion extends TValues[number] = TValues[number],
	>(
		...values: TValues
	): Omit<
		OptionBuilderBase<
			TBuilderConfig,
			TUnion | (TOutput extends undefined ? undefined : never),
			TOmit | "enum",
			TUnion
		>,
		TOmit | "enum"
	> {
		const config = this._.config;
		if (
			config.default !== undefined &&
			!values.includes(config.default as string)
		) {
			throw new CLIError(
				`Enum [${values.join(", ")}] is incompatible with default "${config.default}"`,
			);
		}
		return new OptionBuilderBase({ ...config, enumVals: values }) as any;
	}

	public min(
		value: number,
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "min", TEnums>,
		TOmit | "min"
	> {
		if (this._.config.maxVal !== undefined && this._.config.maxVal < value) {
			throw new CLIError("Min value cannot be higher than max value");
		}
		return new OptionBuilderBase({
			...this._.config,
			minVal: value,
		}) as any;
	}

	public max(
		value: number,
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "max", TEnums>,
		TOmit | "max"
	> {
		if (this._.config.minVal !== undefined && this._.config.minVal > value) {
			throw new CLIError("Max value cannot be lower than min value");
		}
		return new OptionBuilderBase({
			...this._.config,
			maxVal: value,
		}) as any;
	}

	public int(): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "int", TEnums>,
		TOmit | "int"
	> {
		return new OptionBuilderBase({
			...this._.config,
			isInt: true,
		}) as any;
	}

	// --- New additions (from commander.js patterns) ---

	public env(
		varName: string,
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "env", TEnums>,
		TOmit | "env"
	> {
		return new OptionBuilderBase({
			...this._.config,
			envVar: varName,
		}) as any;
	}

	public conflicts(
		...names: string[]
	): Omit<
		OptionBuilderBase<TBuilderConfig, TOutput, TOmit | "conflicts", TEnums>,
		TOmit | "conflicts"
	> {
		return new OptionBuilderBase({
			...this._.config,
			conflictsWith: names,
		}) as any;
	}

	public variadic(): Omit<
		OptionBuilderBase<
			TBuilderConfig,
			string[],
			TOmit | "variadic" | "default",
			TEnums
		>,
		TOmit | "variadic" | "default"
	> {
		if (
			this._.config.type !== "positional" &&
			this._.config.type !== "string"
		) {
			throw new CLIError(
				"`.variadic()` is only valid on string or positional options",
			);
		}
		return new OptionBuilderBase({
			...this._.config,
			isVariadic: true,
		}) as any;
	}
}

// --- Type inference utilities ---

export type GenericBuilderInternals = {
	_: {
		$output: OutputType;
		config: BuilderConfig;
	};
};

export type TypeOf<TOptions extends Record<string, GenericBuilderInternals>> =
	Simplify<{
		[K in keyof TOptions]: TOptions[K]["_"]["$output"];
	}>;

export type Simplify<T> = {
	[K in keyof T]: T[K];
} & {};

// --- Factory functions ---

export function string(): Omit<
	OptionBuilderBase<
		BuilderConfig<"string">,
		string | undefined,
		OptionType | "min" | "max" | "int"
	>,
	OptionType | "min" | "max" | "int"
>;
export function string<TName extends string>(
	name: TName,
): Omit<
	OptionBuilderBase<
		BuilderConfig<"string">,
		string | undefined,
		OptionType | "min" | "max" | "int"
	>,
	OptionType | "min" | "max" | "int"
>;
export function string(name?: string) {
	return name !== undefined
		? new OptionBuilderBase().string(name)
		: new OptionBuilderBase().string();
}

export function number(): Omit<
	OptionBuilderBase<
		BuilderConfig<"number">,
		number | undefined,
		OptionType | "enum" | "variadic"
	>,
	OptionType | "enum" | "variadic"
>;
export function number<TName extends string>(
	name: TName,
): Omit<
	OptionBuilderBase<
		BuilderConfig<"number">,
		number | undefined,
		OptionType | "enum" | "variadic"
	>,
	OptionType | "enum" | "variadic"
>;
export function number(name?: string) {
	return name !== undefined
		? new OptionBuilderBase().number(name)
		: new OptionBuilderBase().number();
}

export function boolean(): Omit<
	OptionBuilderBase<
		BuilderConfig<"boolean">,
		boolean | undefined,
		OptionType | "min" | "max" | "enum" | "int" | "variadic"
	>,
	OptionType | "min" | "max" | "enum" | "int" | "variadic"
>;
export function boolean<TName extends string>(
	name: TName,
): Omit<
	OptionBuilderBase<
		BuilderConfig<"boolean">,
		boolean | undefined,
		OptionType | "min" | "max" | "enum" | "int" | "variadic"
	>,
	OptionType | "min" | "max" | "enum" | "int" | "variadic"
>;
export function boolean(name?: string) {
	return name !== undefined
		? new OptionBuilderBase().boolean(name)
		: new OptionBuilderBase().boolean();
}

export function positional(): Omit<
	OptionBuilderBase<
		BuilderConfig<"positional">,
		string | undefined,
		OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
	>,
	OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
>;
export function positional<TName extends string>(
	displayName: TName,
): Omit<
	OptionBuilderBase<
		BuilderConfig<"positional">,
		string | undefined,
		OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
	>,
	OptionType | "min" | "max" | "int" | "alias" | "env" | "conflicts"
>;
export function positional(displayName?: string) {
	return displayName !== undefined
		? new OptionBuilderBase().positional(displayName)
		: new OptionBuilderBase().positional();
}
