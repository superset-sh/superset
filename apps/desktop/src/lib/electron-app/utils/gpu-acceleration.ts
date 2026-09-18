/**
 * Hardware-acceleration policy.
 *
 * Superset used to call `app.disableHardwareAcceleration()` on every Linux
 * launch. That forces Chromium onto SwiftShader software rasterization for the
 * page compositor, layer painting, CSS effects and every xterm WebGL context —
 * so an idle window burns CPU continuously and the fan never spins down, even
 * though per-process CPU% looks unremarkable (#5948).
 *
 * Chromium already blocklists known-bad GPUs/drivers on its own, so the default
 * on every platform is "let Chromium decide". Users whose driver still
 * misbehaves can opt out explicitly with `--disable-hardware-acceleration` or
 * `SUPERSET_DISABLE_HARDWARE_ACCELERATION=1`.
 */

export const DISABLE_HW_ACCEL_FLAG = "--disable-hardware-acceleration";
export const DISABLE_HW_ACCEL_ENV = "SUPERSET_DISABLE_HARDWARE_ACCELERATION";

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
	return value !== undefined && TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function shouldDisableHardwareAcceleration({
	argv = process.argv,
	env = process.env,
}: {
	argv?: readonly string[];
	env?: Record<string, string | undefined>;
} = {}): boolean {
	for (const arg of argv) {
		if (arg === DISABLE_HW_ACCEL_FLAG) return true;
		if (arg.startsWith(`${DISABLE_HW_ACCEL_FLAG}=`)) {
			return isTruthy(arg.slice(DISABLE_HW_ACCEL_FLAG.length + 1));
		}
	}

	return isTruthy(env[DISABLE_HW_ACCEL_ENV]);
}
