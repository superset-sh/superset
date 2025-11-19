import { createElectronRouter } from "electron-router-dom";

// ⚠️ CRITICAL: This module is shared between main and renderer processes
// DO NOT import Node.js modules (fs, path, os, net, etc.) here!
// Doing so will cause "Module externalized for browser compatibility" errors
// If you need Node.js functionality, use IPC or move code to src/main/

// Note: This module can be safely imported in both main and renderer processes
// The port is injected by Vite at build time via import.meta.env.DEV_SERVER_PORT
// Port value comes from:
// 1. Last used port from ~/.superset/dev-port.json (managed by main process)
// 2. Default port 4927
// The port will automatically switch if unavailable (handled by getPort() async function in main process)

// Get the port from Vite's import.meta.env, falling back to default
const getPort = (): number => {
	// In renderer process, Vite injects this at build time
	if (import.meta.env.DEV_SERVER_PORT) {
		return Number.parseInt(import.meta.env.DEV_SERVER_PORT as string, 10);
	}
	return 4927; // Default fallback
};

export const { Router, registerRoute, settings } = createElectronRouter({
	port: getPort(),
	types: {
		ids: ["main", "about"],
	},
});
