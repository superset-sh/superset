import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Ask the main process to check each dropped path against the filesystem and
 * repair it if the drop folded a Unicode space in the name (#6369). A path
 * that already resolves comes back untouched, and so does one the main process
 * cannot improve, so callers can use the result unconditionally.
 */
export async function repairDroppedPaths(
	paths: readonly string[],
): Promise<string[]> {
	return Promise.all(
		paths.map(async (path) => {
			try {
				return await electronTrpcClient.external.resolveDroppedPath.query({
					path,
				});
			} catch {
				return path;
			}
		}),
	);
}
