import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The managed environment of a cloud workspace sandbox: the environment's
 * variables and the credential placeholders the control plane pushes after
 * boot, held in memory and replaced as a whole on every push. New terminals
 * and agent launches inherit it; nothing writes it to disk, and a restart
 * waits for the control plane to push it again.
 */
let managed: Record<string, string> | null = null;
let firstPush: Promise<void>;
let resolveFirstPush: () => void = () => {};

function reset(): void {
	firstPush = new Promise<void>((resolve) => {
		resolveFirstPush = resolve;
	});
}
reset();

/**
 * Replaces the set. It is mirrored into this process's own environment so
 * everything host-service spawns itself (gh, git, the credential helper, an
 * agent) sees it the way a terminal does; a key dropped by the next push
 * leaves the process environment too.
 */
export async function setManagedEnv(
	variables: Record<string, string>,
): Promise<void> {
	for (const key of Object.keys(managed ?? {})) {
		if (!(key in variables)) delete process.env[key];
	}
	managed = { ...variables };
	Object.assign(process.env, managed);
	// Before the push resolves: an agent launched the moment it does would
	// otherwise commit as the sandbox user.
	await writeGitIdentity(managed);
	resolveFirstPush();
}

/**
 * The GIT_AUTHOR_* variables only reach what host-service spawns; anything
 * else on the box would commit as the sandbox user.
 */
async function writeGitIdentity(
	variables: Record<string, string>,
): Promise<void> {
	const name = variables.GIT_AUTHOR_NAME;
	const email = variables.GIT_AUTHOR_EMAIL;
	if (!name || !email) return;
	for (const [key, value] of [
		["user.name", name],
		["user.email", email],
	] as const) {
		try {
			await run("git", ["config", "--global", key, value]);
		} catch (error) {
			console.warn(`[sandbox] could not write git ${key}`, error);
		}
	}
}

/** The current set, or empty until the first push. */
export function getManagedEnv(): Record<string, string> {
	return managed ? { ...managed } : {};
}

export function hasManagedEnv(): boolean {
	return managed !== null;
}

/** Resolves once the control plane has pushed at least once this process. */
export function waitForManagedEnv(timeoutMs: number): Promise<boolean> {
	return Promise.race([
		firstPush.then(() => true),
		new Promise<boolean>((resolve) =>
			setTimeout(() => resolve(false), timeoutMs),
		),
	]);
}

export function resetManagedEnvForTests(): void {
	for (const key of Object.keys(managed ?? {})) delete process.env[key];
	managed = null;
	reset();
}
