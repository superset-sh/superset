import {
	attentionSignature,
	type V1AttentionItem,
} from "renderer/lib/v1-migration/attention";
import { isV1AttentionDismissed } from "renderer/lib/v1-migration/completion";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type V1MigrationStatus = "idle" | "running" | "blocked" | "attention";

interface DismissedCard {
	organizationId: string;
	status: V1MigrationStatus;
	signature: string;
}

interface V1MigrationStatusState {
	organizationId: string | null;
	status: V1MigrationStatus;
	attentionItems: V1AttentionItem[];
	dismissed: DismissedCard | null;
	setStatus: (
		organizationId: string,
		status: V1MigrationStatus,
		attentionItems?: V1AttentionItem[],
	) => void;
	/** No host-service, so no pass can be in progress for this org. */
	clearRunning: (organizationId: string) => void;
	/** Hides the current card for this session; a new status or list shows again. */
	dismiss: (organizationId: string) => void;
}

export const useV1MigrationStatusStore = create<V1MigrationStatusState>()(
	devtools(
		(set) => ({
			organizationId: null,
			status: "idle",
			attentionItems: [],
			dismissed: null,
			setStatus: (organizationId, status, attentionItems = []) =>
				set({ organizationId, status, attentionItems }),
			clearRunning: (organizationId) =>
				set((state) =>
					state.organizationId === organizationId && state.status === "running"
						? { status: "idle", attentionItems: [] }
						: state,
				),
			dismiss: (organizationId) =>
				set((state) => ({
					dismissed: {
						organizationId,
						status: state.status,
						signature: attentionSignature(state.attentionItems),
					},
				})),
		}),
		{ name: "V1MigrationStatusStore" },
	),
);

type StatusCardState = Pick<
	V1MigrationStatusState,
	"organizationId" | "status" | "attentionItems" | "dismissed"
>;

export function isStatusCardVisible(
	state: StatusCardState,
	organizationId: string | null,
): boolean {
	if (!organizationId || state.organizationId !== organizationId) return false;
	if (state.status === "idle") return false;
	const signature = attentionSignature(state.attentionItems);
	const { dismissed } = state;
	if (
		dismissed?.organizationId === organizationId &&
		dismissed.status === state.status &&
		dismissed.signature === signature
	) {
		return false;
	}
	return !(
		state.status === "attention" &&
		isV1AttentionDismissed(organizationId, signature)
	);
}
