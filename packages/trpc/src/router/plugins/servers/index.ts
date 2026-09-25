import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
	isSupersetHosted,
	type SupersetHostedPlugin,
} from "@superset/shared/plugins";
import type { ConnectionSecrets } from "../../../lib/connectors/upsert";
import { gmailServer } from "./gmail";
import { slackServer } from "./slack";

export interface FirstPartyServer {
	getTools(): Tool[];
	callTool(
		name: string,
		args: Record<string, unknown>,
		credential: string,
	): Promise<CallToolResult>;
	credential(secrets: ConnectionSecrets): string;
}

export const FIRST_PARTY_SERVERS: Record<
	SupersetHostedPlugin,
	FirstPartyServer
> = {
	gmail: gmailServer,
	slack: slackServer,
};

export function firstPartyServer(name: string): FirstPartyServer | undefined {
	return isSupersetHosted(name)
		? FIRST_PARTY_SERVERS[name as SupersetHostedPlugin]
		: undefined;
}
