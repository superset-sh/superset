import { getRegistrationState } from "../../../tunnel/registration-state";
import { publicProcedure, router } from "../../index";

export const healthRouter = router({
	check: publicProcedure.query(() => {
		// A locally-healthy host that failed cloud registration is invisible
		// to hosts list/automations with no symptom of its own — expose the
		// registration outcome so `superset status` can report it (#6415).
		const registration = getRegistrationState();
		return {
			status: "ok" as const,
			cloudRegistered: registration.registered,
			registrationError: registration.lastError,
		};
	}),
});
