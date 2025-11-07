import { createElectronRouter } from "electron-router-dom";
import { getPortSync } from "./port-manager";

// Note: Environment variables are loaded in main/index.ts before any imports
// The port value comes from:
// 1. Last used port from ~/.superset/dev-port.json
// 2. Default port 4927
// The port will automatically switch if unavailable (handled by getPort() async function)
// This module can be safely imported in both main and renderer processes
export const { Router, registerRoute, settings } = createElectronRouter({
	port: getPortSync(),
	types: {
		ids: ["main", "about"],
	},
});
