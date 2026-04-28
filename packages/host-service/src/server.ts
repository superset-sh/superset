import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { closeHostServiceServer, reportHostServiceError } from "./resilience";

type ServeOptions = Parameters<typeof serve>[0];
type ListenInfo = Parameters<NonNullable<Parameters<typeof serve>[1]>>[0];

interface StartHostServiceServerOptions {
	options: ServeOptions;
	injectWebSocket: (server: ServerType) => void;
	onListen?: (info: ListenInfo) => void;
}

export function startHostServiceServer({
	options,
	injectWebSocket,
	onListen,
}: StartHostServiceServerOptions): Promise<ServerType> {
	let server: ServerType | undefined;
	let isListening = false;
	let startupSettled = false;

	return new Promise((resolve, reject) => {
		const rejectStartup = (error: unknown) => {
			if (startupSettled) {
				return;
			}
			startupSettled = true;
			if (server) {
				closeHostServiceServer(server);
			}
			reject(error);
		};

		const resolveStartup = (info: ListenInfo) => {
			if (!server || startupSettled) {
				return;
			}
			isListening = true;
			try {
				onListen?.(info);
			} catch (error) {
				rejectStartup(error);
				return;
			}
			startupSettled = true;
			resolve(server);
		};

		server = serve(options, resolveStartup);
		server.on("error", (error) => {
			if (!isListening) {
				rejectStartup(error);
				return;
			}
			reportHostServiceError("server error", error);
		});

		try {
			injectWebSocket(server);
		} catch (error) {
			rejectStartup(error);
		}
	});
}
