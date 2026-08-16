import type { SupersetPluginApi } from "@superset/plugin-sdk";

// Type-only SDK import (erased at load time), so this entry runs from a
// managed checkout without a node_modules install.
export default async function plugin(api: SupersetPluginApi) {
	api.log("hello plugin loaded");

	api.actions.register("get-count", async () => ({
		count: (await api.storage.get<number>("count")) ?? 0,
	}));

	api.actions.register("increment", async (_params, context) => {
		const count = ((await api.storage.get<number>("count")) ?? 0) + 1;
		await api.storage.set("count", count);
		api.realtime.publish({ count, workspaceId: context.workspaceId ?? null });
		return { count };
	});

	api.events.on("workspace.created", (event) => {
		api.log("workspace created", { workspaceId: event.workspaceId });
	});
}
