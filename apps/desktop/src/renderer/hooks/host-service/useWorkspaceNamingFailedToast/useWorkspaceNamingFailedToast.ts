import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useEffect } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/** Automatic naming gave up on a workspace: say so once; its prompt title stays. */
export function useWorkspaceNamingFailedToast(): void {
	const { activeHostUrl } = useLocalHostService();
	const { t } = useLingui();
	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getHostEventBus(activeHostUrl);
		const release = bus.retain();
		const off = bus.on(
			"workspace:naming-failed",
			"*",
			(_workspaceId, { name }) => {
				toast.warning(t({ message: `Couldn't name "${name}" automatically` }), {
					description: t({ message: "It keeps the title from your prompt." }),
				});
			},
		);
		return () => {
			off();
			release();
		};
	}, [activeHostUrl, t]);
}
