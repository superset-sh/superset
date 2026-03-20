import type { electronTrpc } from "renderer/lib/electron-trpc";

type ElectronTrpcUtils = ReturnType<typeof electronTrpc.useUtils>;

export async function invalidateProjectScriptQueries(
	utils: ElectronTrpcUtils,
	projectId: string,
): Promise<void> {
	await Promise.all([
		utils.config.getConfigContent.invalidate({ projectId }),
		utils.config.shouldShowSetupCard.invalidate({ projectId }),
		utils.workspaces.getResolvedRunCommands.invalidate(),
	]);
}
