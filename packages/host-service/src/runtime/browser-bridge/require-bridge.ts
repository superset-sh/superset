import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../types";
import { BrowserBridgeClient } from "./browser-bridge-client";

/** The desktop bridge, or a caller-fixable error on a host no desktop app spawned. */
export function requireBridge(ctx: HostServiceContext): BrowserBridgeClient {
	if (!ctx.browserBridge) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"This host has no panes to drive (no desktop app is attached to it).",
		});
	}
	return new BrowserBridgeClient(ctx.browserBridge);
}
