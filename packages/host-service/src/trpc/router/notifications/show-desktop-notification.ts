import type { DesktopNotification } from "@superset/shared/desktop-notification";
import { TRPCError } from "@trpc/server";
import {
	bridgeErrorDetail,
	bridgeFetch,
} from "../../../runtime/browser-bridge/bridge-fetch";
import type { HostServiceContext } from "../../../types";

export async function showDesktopNotification(
	ctx: HostServiceContext,
	input: DesktopNotification,
): Promise<{ shown: boolean }> {
	if (!ctx.browserBridge) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"No desktop app is attached to this host, so there is nowhere to show a notification.",
		});
	}
	const res = await bridgeFetch(
		ctx.browserBridge,
		"POST",
		"/notify",
		input,
		"Desktop app",
	);
	if (res.ok) return res.body as { shown: boolean };
	const detail = bridgeErrorDetail(res.body);
	if (res.status === 404 && !detail) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The desktop app on this host is too old to show CLI notifications. Update it and try again.",
		});
	}
	throw new TRPCError({
		code: res.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
		message: detail ?? `Desktop app error (${res.status})`,
	});
}
