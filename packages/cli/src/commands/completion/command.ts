import {
	CLIError,
	generateBashCompletion,
	generateZshCompletion,
	introspectCli,
	positional,
} from "@superset/cli-framework";
import { command } from "../../lib/command";

const GENERATORS: Record<
	string,
	(root: ReturnType<typeof introspectCli>["root"], binName: string) => string
> = {
	bash: generateBashCompletion,
	zsh: generateZshCompletion,
};

export default command({
	description:
		"Print a shell completion script — e.g. source <(superset completion zsh)",
	skipMiddleware: true,
	args: [
		positional("shell")
			.enum("bash", "zsh")
			.required()
			.desc("Shell to generate a completion script for (bash or zsh)"),
	],
	run: async ({ args, options }) => {
		const shell = args.shell as string;
		const generate = GENERATORS[shell];
		// The parser doesn't enforce enums on positionals.
		if (!generate) {
			throw new CLIError(
				`Unsupported shell: ${shell}`,
				`Valid values: ${Object.keys(GENERATORS).join(", ")}`,
			);
		}
		const { name, root } = introspectCli();
		const script = generate(root, name);

		if ((options as Record<string, unknown>).json === true) {
			return { data: { shell, script } };
		}
		// Raw stdout rather than `{ message }`: the script must stay sourceable
		// byte-for-byte, including under agent-mode auto-JSON. Awaiting the
		// write keeps a slow pipe reader from truncating it on exit.
		await new Promise<void>((resolve, reject) =>
			process.stdout.write(script, (error) =>
				error ? reject(error) : resolve(),
			),
		);
		return undefined;
	},
});
