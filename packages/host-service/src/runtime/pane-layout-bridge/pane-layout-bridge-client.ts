import type {
	PaneLayoutOpResult,
	PaneLayoutRequest,
} from "@superset/shared/pane-layout-ops";
import { type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import type { BrowserBridgeConfig } from "../../types";
import { bridgeErrorDetail, bridgeFetch } from "../browser-bridge/bridge-fetch";

const CODE_BY_STATUS: Record<number, TRPC_ERROR_CODE_KEY> = {
	400: "BAD_REQUEST",
	404: "NOT_FOUND",
	412: "PRECONDITION_FAILED",
	503: "PRECONDITION_FAILED",
	504: "TIMEOUT",
};

/** Sends pane layout ops to the desktop app over the browser bridge. */
export class PaneLayoutBridgeClient {
	constructor(private readonly config: BrowserBridgeConfig) {}

	async apply(request: PaneLayoutRequest): Promise<PaneLayoutOpResult> {
		const res = await bridgeFetch(
			this.config,
			"POST",
			"/pane-layout",
			request,
			"Desktop app",
		);
		if (res.ok) return res.body as PaneLayoutOpResult;
		const detail = bridgeErrorDetail(res.body);
		if (res.status === 404 && !detail) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message:
					"The desktop app on this host is too old to edit pane layouts. Update it and try again.",
			});
		}
		throw new TRPCError({
			code: CODE_BY_STATUS[res.status] ?? "INTERNAL_SERVER_ERROR",
			message: detail ?? `Desktop app error (${res.status})`,
		});
	}
}
