import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

export const IS_DEV = !app.isPackaged;
export const IS_TEST = process.env.NODE_ENV === "test";

export const SUPERSET_DIR_NAME = IS_DEV ? ".superset-dev" : ".superset";
export const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

export const NOTIFICATIONS_PORT = IS_DEV ? 31416 : 31415;
export const VITE_PORT_START = IS_DEV ? 5927 : 4927;
export const VITE_PORT_END = IS_DEV ? 5999 : 4999;

// For lowdb - use our own path instead of app.getPath("userData")
export const DB_PATH = join(SUPERSET_HOME_DIR, "db.json");
