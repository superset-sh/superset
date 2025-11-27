import { createElectronRouter } from "electron-router-dom";
import { PORTS } from "shared/constants";

export const { Router, registerRoute, settings } = createElectronRouter({
	port: PORTS.VITE_DEV_SERVER,
	types: {
		ids: ["main", "about"],
	},
});
