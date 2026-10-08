import { afterAll, beforeEach } from "bun:test";
import SuperJSON from "superjson";
import { withTempSupersetHome } from "../settings/test-helpers";
import { writeManifest } from "./manifest";

type Procedure = (input: Record<string, unknown>) => unknown;

/**
 * Give every test in the calling file a running host-service on this machine:
 * a local tRPC endpoint that answers `procedures` (keyed by dotted path), and
 * a manifest for it in a fresh SUPERSET_HOME_DIR.
 */
export function withLocalHostService(
	organizationId: string,
	procedures: Record<string, Procedure>,
): void {
	withTempSupersetHome("superset-cli-host-");

	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(request) {
			const url = new URL(request.url);
			const paths = url.pathname.replace(/^\/trpc\//, "").split(",");
			const inputs: Record<
				string,
				Parameters<typeof SuperJSON.deserialize>[0]
			> =
				request.method === "GET"
					? JSON.parse(url.searchParams.get("input") ?? "{}")
					: await request.json();
			return Response.json(
				await Promise.all(
					paths.map(async (path, index) => {
						try {
							const procedure = procedures[path];
							if (!procedure) {
								throw new Error(`No procedure found on path "${path}"`);
							}
							const serialized = inputs[index];
							const output = await procedure(
								serialized ? SuperJSON.deserialize(serialized) : {},
							);
							return { result: { data: SuperJSON.serialize(output) } };
						} catch (error) {
							return {
								error: SuperJSON.serialize({
									message: error instanceof Error ? error.message : "failed",
									code: -32603,
									data: {
										code: "INTERNAL_SERVER_ERROR",
										httpStatus: 500,
										path,
									},
								}),
							};
						}
					}),
				),
			);
		},
	});
	afterAll(() => server.stop(true));

	beforeEach(() => {
		writeManifest({
			pid: process.pid,
			endpoint: `http://127.0.0.1:${server.port}`,
			authToken: "host-secret",
			startedAt: Date.now(),
			organizationId,
		});
	});
}
