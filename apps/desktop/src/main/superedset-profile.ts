import { mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

if (app.getName() === "Superedset") {
	const profilePath = path.join(app.getPath("appData"), "Superset");
	mkdirSync(profilePath, { recursive: true });
	app.setPath("userData", profilePath);
	app.setPath("sessionData", profilePath);
}
