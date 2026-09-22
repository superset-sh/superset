import {
	getHostInstallSource,
	HOST_SERVICE_VERSION,
} from "../../../install-source";
import {
	readBootStamps,
	type SandboxBootReport,
} from "../../../runtime/boot-stamps";
import { getRegistrationState } from "../../../tunnel/registration-state";
import { publicProcedure, router } from "../../index";
import { readSandboxBootStatus } from "../sandbox";

/**
 * A sandbox reports how its boot went: the boot runner's phase stamps plus
 * this process's own, the runtime it landed on, the bundle it is pinned to
 * and which ready flags are up. A host on someone's machine has no boot
 * runner and reports nothing here.
 */
export function sandboxBootReport(
	env: NodeJS.ProcessEnv = process.env,
): SandboxBootReport | undefined {
	if (env.SUPERSET_HOST_RUN_MODE !== "sandbox") return undefined;
	const status = readSandboxBootStatus();
	return {
		stamps: readBootStamps(),
		runtime: { node: process.version, hostService: HOST_SERVICE_VERSION },
		bundle: status.bundle,
		ready: status.ready,
	};
}

export const healthRouter = router({
	check: publicProcedure.query(() => {
		// A locally-healthy host that failed cloud registration is invisible
		// to hosts list/automations with no symptom of its own — expose the
		// registration outcome so `superset status` can report it (#6415).
		const registration = getRegistrationState();
		return {
			status: "ok" as const,
			pid: process.pid,
			// The desktop app spawns its own bundled build, so this doubles as
			// the app version for a standalone CLI collecting diagnostics.
			version: HOST_SERVICE_VERSION,
			installSource: getHostInstallSource(),
			cloudRegistered: registration.registered,
			registrationError: registration.lastError,
			sandboxBoot: sandboxBootReport(),
		};
	}),
});
