import { command } from "../../../lib/command";

export default command({
	description:
		"Print the auth headers for Superset's plugin MCP endpoints (for an agent's headers helper)",
	// Under `auth` because it has to be publicly reachable and `plugins` is
	// not: an audience-gated group is absent, not hidden, and a command marked
	// public inside it is pruned with its parent. An agent runs this itself and
	// will not carry SUPERSET_CLI_AUDIENCE=internal. `auth` is also where the
	// credential it prints comes from.
	audience: "public",
	// Runnable but unlisted: a person never types this, an agent's headers
	// helper does. Internal would have made it absent rather than quiet.
	hidden: true,
	// A cloud workspace holds no credential at all: the firewall attaches one
	// on the way out, naming the workspace rather than a person. There is
	// nothing here to print, and printing an empty Bearer would look like
	// success.
	sandbox: false,
	args: [],
	options: {},
	/**
	 * Claude reads this as `headersHelper` and Codex as `http_headers_helper`:
	 * a command whose stdout is a JSON object of headers, re-run per connection
	 * and again when the server rejects. Printing the credential here instead of
	 * writing it into the agent's config is the whole point — nothing
	 * long-lived lands in ~/.claude.json or ~/.codex/config.toml, and rotation
	 * happens wherever the CLI's own auth does.
	 */
	run: async ({ ctx }) => {
		const headers = { Authorization: `Bearer ${ctx.bearer}` };
		return {
			data: headers,
			// stdout must be the JSON object and nothing else: the agent parses
			// the whole of it.
			message: JSON.stringify(headers),
		};
	},
});
