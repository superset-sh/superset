import { randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function writeTempAskpass(token: string): Promise<string> {
	const filePath = join(tmpdir(), `git-askpass-${randomUUID()}.sh`);
	await writeFile(filePath, `#!/bin/sh\necho "${token}"\n`);
	await chmod(filePath, 0o700);
	return filePath;
}
