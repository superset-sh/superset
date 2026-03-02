import path from "node:path";
import { SUPERSET_HOME_DIR } from "../app-environment";

export const BIN_DIR = path.join(SUPERSET_HOME_DIR, "bin");
export const HOOKS_DIR = path.join(SUPERSET_HOME_DIR, "hooks");
export const ZSH_DIR = path.join(SUPERSET_HOME_DIR, "zsh");
export const BASH_DIR = path.join(SUPERSET_HOME_DIR, "bash");
export const OPENCODE_CONFIG_DIR = path.join(HOOKS_DIR, "opencode");
export const OPENCODE_PLUGIN_DIR = path.join(OPENCODE_CONFIG_DIR, "plugin");
