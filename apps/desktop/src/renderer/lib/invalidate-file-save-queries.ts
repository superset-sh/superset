import { createTRPCQueryUtils } from "@trpc/react-query";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider";
import { electronReactClient } from "./trpc-client";

const electronTrpcUtils = createTRPCQueryUtils({
	client: electronReactClient,
	queryClient: electronQueryClient,
});

export function invalidateFileSaveQueries(input: {
	workspaceId: string;
	filePath: string;
}): void {
	void electronTrpcUtils.filesystem.readFile.invalidate({
		workspaceId: input.workspaceId,
		absolutePath: input.filePath,
	});
	void electronTrpcUtils.changes.getGitFileContents.invalidate();
	void electronTrpcUtils.changes.getStatus.invalidate();
}
