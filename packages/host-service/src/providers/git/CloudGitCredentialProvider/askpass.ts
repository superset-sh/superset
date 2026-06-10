import { randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempAskpass {
	askpassPath: string;
	cleanupPaths: string[];
}

function quotePosix(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export async function writeTempAskpass(
	token: string,
	platform: NodeJS.Platform = process.platform,
): Promise<TempAskpass> {
	const id = randomUUID();
	const extension = platform === "win32" ? "cmd" : "sh";
	const askpassPath = join(tmpdir(), `git-askpass-${id}.${extension}`);
	const tokenPath = join(tmpdir(), `git-askpass-token-${id}.txt`);

	await writeFile(tokenPath, token, { mode: 0o600 });

	const script =
		platform === "win32"
			? `@echo off\r\nsetlocal\r\nset "prompt=%~1"\r\nif /i "%prompt:~0,8%"=="Username" (\r\n  echo x-access-token\r\n) else (\r\n  type "${tokenPath}"\r\n)\r\n`
			: `#!/bin/sh
case "$1" in
  Username*) printf '%s\\n' 'x-access-token' ;;
  *) cat ${quotePosix(tokenPath)} ;;
esac
`;

	await writeFile(askpassPath, script, { mode: 0o700 });
	if (platform !== "win32") {
		await chmod(askpassPath, 0o700);
		await chmod(tokenPath, 0o600);
	}

	return { askpassPath, cleanupPaths: [askpassPath, tokenPath] };
}
