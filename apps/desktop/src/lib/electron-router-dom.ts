import { createElectronRouter } from "electron-router-dom";

// Note: Environment variables are loaded in main/index.ts before any imports
// The port value comes from VITE_DEV_SERVER_PORT in the monorepo root .env file
// This module can be safely imported in both main and renderer processes
export const { Router, registerRoute, settings } = createElectronRouter({
	port: Number(process.env.VITE_DEV_SERVER_PORT) || 4927,
	types: {
		ids: ["main", "about"],
	},
});
