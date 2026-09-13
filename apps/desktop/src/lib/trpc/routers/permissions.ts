import { PLATFORM } from "shared/constants";
import { publicProcedure, router } from "..";
import {
	getPermissionStatus,
	requestAccessibility,
	requestAppleEvents,
	requestFullDiskAccess,
	requestLocalNetwork,
	requestMicrophone,
} from "./permissions/native-permissions";

// Every permission behind this router is a macOS TCC prompt. Off macOS there is
// nothing to grant, so the settings rows hide rather than showing as denied.
const NOT_APPLICABLE = "not-applicable" as const;

export const createPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(() => {
			if (!PLATFORM.IS_MAC) {
				return {
					fullDiskAccess: NOT_APPLICABLE,
					accessibility: NOT_APPLICABLE,
					microphone: NOT_APPLICABLE,
				};
			}
			return getPermissionStatus();
		}),

		requestFullDiskAccess: publicProcedure.mutation(async () => {
			if (!PLATFORM.IS_MAC) return;
			await requestFullDiskAccess();
		}),

		requestAccessibility: publicProcedure.mutation(async () => {
			if (!PLATFORM.IS_MAC) return;
			await requestAccessibility();
		}),

		requestMicrophone: publicProcedure.mutation(async () => {
			if (!PLATFORM.IS_MAC) return { granted: false };
			return requestMicrophone();
		}),

		requestAppleEvents: publicProcedure.mutation(async () => {
			if (!PLATFORM.IS_MAC) return;
			await requestAppleEvents();
		}),

		requestLocalNetwork: publicProcedure.mutation(async () => {
			if (!PLATFORM.IS_MAC) return;
			await requestLocalNetwork();
		}),
	});
};
