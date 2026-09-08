import { callTool, getTools } from "./tools";
import { type PluginEvent, PluginEventType, type PluginResult } from "./types";

export async function run(event: PluginEvent): Promise<PluginResult> {
	switch (event.event) {
		case PluginEventType.GET_TOOLS:
			return getTools();

		case PluginEventType.CALL_TOOL:
			return await callTool(
				event.eventBody.name,
				event.eventBody.arguments ?? {},
				event.config?.access_token,
			);

		default:
			return { message: `Unhandled event: ${(event as PluginEvent).event}` };
	}
}
