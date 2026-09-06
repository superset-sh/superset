import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { getRegistrationState } from "../../../tunnel/registration-state";
import { publicProcedure, router } from "../../index";

const HOST_SERVICE_VERSION: string = hostServicePackageJson.version;

export const healthRouter = router({
	check: publicProcedure.query(() => {
		// A locally-healthy host that failed cloud registration is invisible
		// to hosts list/automations with no symptom of its own — expose the
		// registration outcome so `superset status` can report it (#6415).
		const registration = getRegistrationState();
		return {
			status: "ok" as const,
			// The desktop app spawns its own bundled build, so this doubles as
			// the app version for a standalone CLI collecting diagnostics.
			version: HOST_SERVICE_VERSION,
			cloudRegistered: registration.registered,
			registrationError: registration.lastError,
		};
	}),
});
