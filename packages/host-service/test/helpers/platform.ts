import * as os from "node:os";
import * as path from "node:path";

export function makeTestDaemonSocketPath(prefix: string): string {
	const id = `${prefix}-${process.pid}`;
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\${id}`;
	}

	return path.join(os.tmpdir(), `${id}.sock`);
}
