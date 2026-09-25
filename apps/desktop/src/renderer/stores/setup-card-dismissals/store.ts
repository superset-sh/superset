import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

/** Dismissals for the setup-script card, keyed by projectId. */
export const useSetupCardDismissalsStore = createDismissalsStore(
	"v2-setup-card-dismissals-v1",
	"SetupCardDismissals",
);
