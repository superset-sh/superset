/**
 * Proxy-related IPC channels
 */

import type { NoRequest } from "./types";

export interface ProxyChannels {
	"proxy-get-status": {
		request: NoRequest;
		response: Array<{
			canonical: number;
			target?: number;
			service?: string;
			active: boolean;
		}>;
	};
}

