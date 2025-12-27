import type { registerRoute } from "lib/electron-router-dom";

type Route = Parameters<typeof registerRoute>[0];

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
	id: Route["id"];
	query?: Route["query"];
}
