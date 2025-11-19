import { createElectronRouter } from "electron-router-dom";

// ⚠️ CRITICAL: This module is shared between main and renderer processes
// DO NOT import Node.js modules (fs, path, os, net, etc.) here!
// Doing so will cause "Module externalized for browser compatibility" errors
// If you need Node.js functionality, use IPC or move code to src/main/

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
