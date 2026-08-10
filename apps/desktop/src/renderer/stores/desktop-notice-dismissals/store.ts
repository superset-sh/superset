import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

export const useDesktopNoticeDismissalsStore = createDismissalsStore(
	"desktop-notice-dismissals-v1",
	"DesktopNoticeDismissals",
);
