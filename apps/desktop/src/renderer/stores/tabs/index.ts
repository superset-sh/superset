export * from "./store";
export * from "./types";
export * from "./useAgentHookListener";
export * from "./utils";

// Convenience hooks for cloud/webview operations
import { useWindowsStore } from "./store";

export const useAddWebviewWindow = () =>
	useWindowsStore((state) => state.addWebviewWindow);

export const useAddCloudWindow = () =>
	useWindowsStore((state) => state.addCloudWindow);
