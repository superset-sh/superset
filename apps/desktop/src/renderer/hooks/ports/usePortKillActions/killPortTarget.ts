import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type PortKillResult = { success: boolean; error?: string };

export interface PortKillTarget {
	workspaceId: string;
	terminalId: string;
	port: number;
	hostUrl?: string | null;
}

export type LocalPortKill = (input: {
	workspaceId: string;
	terminalId: string;
	port: number;
}) => Promise<PortKillResult>;

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export async function killPortTarget(
	target: PortKillTarget,
	localKill?: LocalPortKill,
): Promise<PortKillResult> {
	const payload = {
		workspaceId: target.workspaceId,
		terminalId: target.terminalId,
		port: target.port,
	};

	try {
		if (target.hostUrl) {
			return await getHostServiceClientByUrl(target.hostUrl).ports.kill.mutate(
				payload,
			);
		}

		if (!localKill) {
			return {
				success: false,
				error: "No host is available for this port",
			};
		}

		return await localKill(payload);
	} catch (error) {
		return { success: false, error: toErrorMessage(error) };
	}
}
