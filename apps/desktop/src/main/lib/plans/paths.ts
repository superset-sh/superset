import path from "node:path";
import { SUPERSET_HOME_DIR } from "../app-environment";

/** Directory for temporary plan files */
export const PLANS_TMP_DIR = path.join(SUPERSET_HOME_DIR, "tmp", "plans");

/** Valid plan ID pattern: alphanumeric + hyphens only */
export const PLAN_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

/** Maximum allowed plan file size (1MB) */
export const MAX_PLAN_FILE_SIZE = 1024 * 1024;
