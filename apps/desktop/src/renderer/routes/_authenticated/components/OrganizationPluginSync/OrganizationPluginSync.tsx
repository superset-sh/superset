import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { managedPluginsKey } from "./utils/managedPluginsKey";

let lastSyncedKey: string | null = null;

export function OrganizationPluginSync() {
	const isFlagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const isEnabled = env.NODE_ENV === "development" || isFlagEnabled === true;
	return isEnabled ? <SyncOnCatalogChange /> : null;
}

function SyncOnCatalogChange() {
	const { plugins, isLoading, error } = usePluginCatalog();
	const { mutate: sync } = electronTrpc.plugins.sync.useMutation();
	const key = isLoading || error ? null : managedPluginsKey(plugins);

	useEffect(() => {
		if (key === null || key === lastSyncedKey) return;
		lastSyncedKey = key;
		sync();
	}, [key, sync]);

	return null;
}
