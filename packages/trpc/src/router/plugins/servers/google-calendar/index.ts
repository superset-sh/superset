import type { ConnectionSecrets } from "../../../../lib/connectors/upsert";
import { callTool } from "./handlers";
import { getTools } from "./tools";

export const googleCalendarServer = {
	getTools,
	callTool,
	credential: (secrets: ConnectionSecrets) => secrets.accessToken,
};
