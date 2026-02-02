import { homedir } from "node:os";
import { join } from "node:path";

const IS_WINDOWS = process.platform === "win32";

const SUPERSET_DIR_NAME =
	process.env.NODE_ENV === "development" ? ".superset-dev" : ".superset";
const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

const PIPE_SUFFIX = (process.env.USERNAME ?? process.env.USER ?? "user").replace(
	/[^a-zA-Z0-9_.-]/g,
	"_",
);

const SOCKET_PATH = IS_WINDOWS
	? `\\\\.\\pipe\\superset-terminal-host-${PIPE_SUFFIX}`
	: join(SUPERSET_HOME_DIR, "terminal-host.sock");

export const TERMINAL_HOST_PATHS = {
	IS_WINDOWS,
	SUPERSET_DIR_NAME,
	SUPERSET_HOME_DIR,
	SOCKET_PATH,
	TOKEN_PATH: join(SUPERSET_HOME_DIR, "terminal-host.token"),
	PID_PATH: join(SUPERSET_HOME_DIR, "terminal-host.pid"),
	SPAWN_LOCK_PATH: join(SUPERSET_HOME_DIR, "terminal-host.spawn.lock"),
	SCRIPT_MTIME_PATH: join(SUPERSET_HOME_DIR, "terminal-host.mtime"),
};
