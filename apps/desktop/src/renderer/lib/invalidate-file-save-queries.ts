import { createTRPCQueryUtils } from "@trpc/react-query";
import type { AppRouter } from "lib/trpc/routers";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { electronReactClient } from "./trpc-client";

let _electronTrpcUtils: ReturnType<
	typeof createTRPCQueryUtils<AppRouter>
> | null = null;

function getElectronTrpcUtils() {
	if (!_electronTrpcUtils) {
		_electronTrpcUtils = createTRPCQueryUtils<AppRouter>({
			client: electronReactClient,
			queryClient: electronQueryClient,
		});
	}
	return _electronTrpcUtils;
}

export function invalidateFileSaveQueries(input: {
	workspaceId: string;
	filePath: string;
}): void {
	const utils = getElectronTrpcUtils();
	void utils.filesystem.readFile.invalidate({
		workspaceId: input.workspaceId,
		absolutePath: input.filePath,
	});
	void utils.changes.getGitFileContents.invalidate();
	void utils.changes.getStatus.invalidate();
}
