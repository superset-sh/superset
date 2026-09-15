import type { ConnectionSecrets } from "../../../../lib/connectors/upsert";
import { callTool, getTools } from "./tools";

export const slackServer = {
	getTools,
	callTool,
	credential: (secrets: ConnectionSecrets) =>
		secrets.config.bot_token ?? secrets.accessToken,
};
