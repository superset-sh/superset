import type { V1AttentionItem } from "renderer/lib/v1-migration/attention";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type V1MigrationStatus = "idle" | "running" | "blocked" | "attention";

interface V1MigrationStatusState {
	organizationId: string | null;
	status: V1MigrationStatus;
	attentionItems: V1AttentionItem[];
	setStatus: (
		organizationId: string,
		status: V1MigrationStatus,
		attentionItems?: V1AttentionItem[],
	) => void;
}

export const useV1MigrationStatusStore = create<V1MigrationStatusState>()(
	devtools(
		(set) => ({
			organizationId: null,
			status: "idle",
			attentionItems: [],
			setStatus: (organizationId, status, attentionItems = []) =>
				set({ organizationId, status, attentionItems }),
		}),
		{ name: "V1MigrationStatusStore" },
	),
);
