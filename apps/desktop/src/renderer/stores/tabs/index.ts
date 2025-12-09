export * from "./store";
export * from "./types";
export * from "./useAgentHookListener";
export * from "./utils";

// Convenience hooks for cloud/webview operations
import { useTabsStore } from "./store";

export const useAddWebviewTab = () =>
	useTabsStore((state) => state.addWebviewTab);

export const useAddCloudTab = () => useTabsStore((state) => state.addCloudTab);
