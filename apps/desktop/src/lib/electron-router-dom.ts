import { createElectronRouter } from "electron-router-dom";

const DEFAULT_PORT = 4927;

const getPort = (): number => {
	// In renderer process, Vite injects this at build time
	if (import.meta.env.DEV_SERVER_PORT) {
		return Number.parseInt(import.meta.env.DEV_SERVER_PORT as string, 10);
	}
	return DEFAULT_PORT;
};

export const { Router, registerRoute, settings } = createElectronRouter({
	port: getPort(),
	types: {
		ids: ["main", "about"],
	},
});
