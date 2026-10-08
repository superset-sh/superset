import path from "node:path";
import { getBinDir } from "./paths";

/**
 * The managed shim rather than a bare `superset`: the agent runs this in its own
 * environment, which need not carry our bin dir on PATH. Absent on a cloud box —
 * the firewall adds a credential there and the CLI's own bearer is empty, so a
 * helper would print `Bearer ` and fail every call.
 */
export function mcpHeadersHelperCommand(): string | undefined {
	if (process.env.SUPERSET_SANDBOX_WORKSPACE_ID) return undefined;
	return `${path.join(getBinDir(), "superset")} auth mcp-headers`;
}
