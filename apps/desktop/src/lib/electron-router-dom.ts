import { createElectronRouter } from "electron-router-dom";

// Dev server port - must match electron.vite.config.ts DEV_SERVER_PORT
// This file is shared between main/renderer and can't import Node.js modules,
// so we hardcode the dev port here. In production, renderer loads from bundled files.
const DEV_SERVER_PORT = 5927;

export const { Router, registerRoute, settings } = createElectronRouter({
	port: DEV_SERVER_PORT,
	types: {
		ids: ["main", "about"],
	},
});
