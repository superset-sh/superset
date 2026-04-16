import { createTRPCProxyClient } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { electronTrpc } from "./electron-trpc";
import { sessionIdLink } from "./session-id-link";

function createLinks() {
	return [sessionIdLink(), ipcLink({ transformer: superjson })];
}

/** Electron tRPC React client for React hooks (used by ElectronTRPCProvider).
 *  Lazily initialized — ipcLink() requires the electronTRPC global which is
 *  set up by the Electron preload script and may not exist at module-load
 *  time in test environments. */
let _electronReactClient: ReturnType<typeof electronTrpc.createClient> | null =
	null;
export const electronReactClient = new Proxy(
	{} as ReturnType<typeof electronTrpc.createClient>,
	{
		get(_target, prop, receiver) {
			if (!_electronReactClient) {
				_electronReactClient = electronTrpc.createClient({
					links: createLinks(),
				});
			}
			return Reflect.get(_electronReactClient, prop, receiver);
		},
	},
);

/** Electron tRPC proxy client for imperative calls from stores/utilities.
 *  Lazily initialized for the same reason as electronReactClient above. */
let _electronTrpcClient: ReturnType<
	typeof createTRPCProxyClient<AppRouter>
> | null = null;
export const electronTrpcClient = new Proxy(
	{} as ReturnType<typeof createTRPCProxyClient<AppRouter>>,
	{
		get(_target, prop, receiver) {
			if (!_electronTrpcClient) {
				_electronTrpcClient = createTRPCProxyClient<AppRouter>({
					links: createLinks(),
				});
			}
			return Reflect.get(_electronTrpcClient, prop, receiver);
		},
	},
);
