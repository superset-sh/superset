import { z } from "zod";

const envSchema = z.object({
	/** Shared with the API, which mints the tickets this gate verifies and derives each sandbox's host secret from. */
	SANDBOX_GATE_SECRET: z.string().min(32),
	/**
	 * The domain workspace hostnames hang off, e.g. sandbox.supersetusercontent.com.
	 * Unset for a local `wrangler dev`, which answers on one hostname for every workspace.
	 */
	SANDBOX_GATE_DOMAIN: z.string().min(1).optional(),
});

export type SandboxGateEnv = z.infer<typeof envSchema>;

const validated = new WeakSet<object>();

export function assertEnv(env: SandboxGateEnv): void {
	if (validated.has(env)) return;
	envSchema.parse(env);
	validated.add(env);
}
