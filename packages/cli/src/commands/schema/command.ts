import { generateSchema, introspectCli } from "@superset/cli-framework";
import { command } from "../../lib/command";

export default command({
	description:
		"Print the CLI's full command tree and options as JSON — for tooling that wants to know exactly what's callable without parsing --help text",
	skipMiddleware: true,
	run: async () => {
		const { name, root } = introspectCli();
		return { data: generateSchema(root, name) };
	},
});
