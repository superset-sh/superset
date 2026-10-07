import { session } from "electron";

const HUB_PATH = /^\/vendor\/serve-(sim|emu)(\/|$)/;

function isLocalDeviceHub(rawUrl: string): boolean {
	const url = new URL(rawUrl);
	return url.hostname === "127.0.0.1" && HUB_PATH.test(url.pathname);
}

/**
 * The Mobile pane talks to a device hub on a loopback port. The hub serves
 * logs, settings and its control socket to its own origin only, so requests
 * from the renderer are presented as same-origin and their responses made
 * readable.
 */
export function allowRendererToReachDeviceHub(partition: string): void {
	const { webRequest } = session.fromPartition(partition);
	const filter = {
		urls: ["http://127.0.0.1:*/vendor/*", "ws://127.0.0.1:*/vendor/*"],
	};

	webRequest.onBeforeSendHeaders(filter, (details, callback) => {
		if (!isLocalDeviceHub(details.url)) {
			callback({});
			return;
		}
		const url = new URL(details.url);
		callback({
			requestHeaders: {
				...details.requestHeaders,
				Origin: `http://${url.host}`,
			},
		});
	});

	webRequest.onHeadersReceived(filter, (details, callback) => {
		if (!isLocalDeviceHub(details.url)) {
			callback({});
			return;
		}
		const responseHeaders = Object.fromEntries(
			Object.entries(details.responseHeaders ?? {}).filter(
				([name]) => !name.toLowerCase().startsWith("access-control-"),
			),
		);
		callback({
			responseHeaders: {
				...responseHeaders,
				"Access-Control-Allow-Origin": ["*"],
				"Access-Control-Allow-Headers": ["*"],
				"Access-Control-Allow-Methods": ["GET, POST, PUT, PATCH, DELETE"],
			},
			...(details.method === "OPTIONS"
				? { statusLine: "HTTP/1.1 204 No Content" }
				: {}),
		});
	});
}
