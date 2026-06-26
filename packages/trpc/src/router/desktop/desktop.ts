import type { TRPCRouterRecord } from "@trpc/server";
import { publicProcedure } from "../../trpc";

const MINIMUM_DESKTOP_VERSION = "1.5.0";

const UPDATE_REQUIRED_MESSAGE =
	"Please update to the latest version to continue.";

export const desktopRouter = {
	/**
	 * Minimum desktop version the cloud will accept. The renderer's
	 * `useVersionCheck` polls this and gates the app behind the
	 * UpdateRequiredPage when the running version is below this floor.
	 *
	 * Public so the check can run before the user authenticates.
	 */
	minimumVersion: publicProcedure.query(() => ({
		minimumVersion: MINIMUM_DESKTOP_VERSION,
		message: UPDATE_REQUIRED_MESSAGE,
	})),
} satisfies TRPCRouterRecord;
