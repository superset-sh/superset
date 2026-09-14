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
export function setManagedEnv(variables: Record<string, string>): void {
	for (const key of Object.keys(managed ?? {})) {
		if (!(key in variables)) delete process.env[key];
	}
	managed = { ...variables };
	Object.assign(process.env, managed);
	resolveFirstPush();
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
