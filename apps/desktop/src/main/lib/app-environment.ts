import { homedir } from "node:os";
import { join } from "node:path";
import { ENVIRONMENT, SUPERSET_DIR_NAME } from "shared/constants";

export const IS_DEV = ENVIRONMENT.IS_DEV;
export const IS_TEST = process.env.NODE_ENV === "test";

export const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

// For lowdb - use our own path instead of app.getPath("userData")
export const DB_PATH = join(SUPERSET_HOME_DIR, "db.json");
export const APP_STATE_PATH = join(SUPERSET_HOME_DIR, "app-state.json");
