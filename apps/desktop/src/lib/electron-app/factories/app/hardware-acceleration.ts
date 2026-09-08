/**
 * Hardware-acceleration (GPU) policy for the Electron app.
 *
 * Hardware acceleration stays ON everywhere by default: Chromium's own GPU
 * blocklist already sidelines known-bad drivers, and disabling it wholesale
 * pushes compositing, layer paint and every xterm WebGL context onto the
 * SwiftShader CPU rasterizer. That barely registers in `top` per-process, but
 * it pins cores and ramps the fan for an entire session (SUPER: Linux AppImage
 * fan-ramp regression).
 *
 * Users on a genuinely broken driver can still opt out explicitly, per launch
 * (`--disable-gpu`) or persistently (`SUPERSET_DISABLE_GPU=1` in the launcher
 * environment). Kept as a pure decision so the matrix is testable without
 * booting Electron.
 */

export const DISABLE_GPU_ENV_VAR = "SUPERSET_DISABLE_GPU";

export const DISABLE_GPU_ARGV_FLAGS = [
	"--disable-gpu",
	"--disable-hardware-acceleration",
] as const;

type HardwareAccelerationInput = {
	platform?: string;
	argv?: readonly string[];
	env?: Record<string, string | undefined>;
};

type GpuCapableApp = {
	disableHardwareAcceleration: () => void;
};

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function hasDisableGpuFlag(argv: readonly string[]): boolean {
	return argv.some((arg) =>
		DISABLE_GPU_ARGV_FLAGS.some(
			(flag) => arg === flag || arg.startsWith(`${flag}=`),
		),
	);
}

export function shouldDisableHardwareAcceleration({
	argv = process.argv,
	env = process.env,
}: HardwareAccelerationInput = {}): boolean {
	return (
		hasDisableGpuFlag(argv) ||
		TRUTHY_ENV_VALUES.has((env[DISABLE_GPU_ENV_VAR] ?? "").toLowerCase())
	);
}

export function applyHardwareAccelerationPolicy(
	app: GpuCapableApp,
	input: HardwareAccelerationInput = {},
): boolean {
	const disable = shouldDisableHardwareAcceleration(input);
	if (disable) app.disableHardwareAcceleration();
	return disable;
}
