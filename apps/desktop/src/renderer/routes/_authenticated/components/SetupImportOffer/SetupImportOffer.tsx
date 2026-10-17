import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import {
	setupImportCandidatesQuery,
	withChanges,
} from "renderer/hooks/host-service/useSetupImportCandidates";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { ImportSetupDialog } from "renderer/routes/_authenticated/components/ImportSetupDialog";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2SetupCardDismissalsStore } from "renderer/stores/v2-setup-card-dismissals";
import {
	offerSetupImport,
	type SetupImportOfferTarget,
} from "./utils/offerSetupImport";

const PROMPT_DURATION_MS = 30_000;

function waitForFocus(signal: AbortSignal): Promise<void> {
	if (document.hasFocus()) return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			window.removeEventListener("focus", done);
			signal.removeEventListener("abort", done);
			resolve();
		};
		window.addEventListener("focus", done);
		signal.addEventListener("abort", done);
	});
}

/**
 * Asks to import another tool's setup when a project is added on this
 * machine. Every add flow, the CLI included, ends in the host's
 * `project:changed` "created" event, so one listener covers them all.
 */
export function SetupImportOffer() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const { activeHostUrl } = useLocalHostService();
	const [reviewing, setReviewing] = useState<SetupImportOfferTarget | null>(
		null,
	);
	const { data } = useQuery({
		...setupImportCandidatesQuery(
			reviewing?.hostUrl ?? null,
			reviewing?.projectId ?? null,
		),
		enabled: reviewing !== null,
	});

	const hasImport = useEffectEvent(
		async ({ hostUrl, projectId }: SetupImportOfferTarget) => {
			const client = getHostServiceClientByUrl(hostUrl);
			if (!(await client.config.shouldShowSetupCard.query({ projectId }))) {
				return false;
			}
			const result = await queryClient.fetchQuery(
				setupImportCandidatesQuery(hostUrl, projectId),
			);
			return withChanges(result.candidates).length > 0;
		},
	);

	const prompt = useEffectEvent((target: SetupImportOfferTarget) => {
		const { projectId, projectName } = target;
		toast(t`No Superset setup scripts`, {
			id: `setup-import-offer:${projectId}`,
			description: t`${projectName} has setup scripts from another tool. Import them?`,
			duration: PROMPT_DURATION_MS,
			action: {
				label: t`Import`,
				onClick: () => setReviewing(target),
			},
			cancel: {
				label: t`Not now`,
				onClick: () =>
					useV2SetupCardDismissalsStore.getState().dismiss(projectId),
			},
		});
	});

	useEffect(() => {
		if (!activeHostUrl) return;
		const hostUrl = activeHostUrl;
		const controller = new AbortController();
		const bus = getHostEventBus(hostUrl);
		const removeListener = bus.on(
			"project:changed",
			"*",
			(projectId, event) => {
				if (event.eventType !== "created" || !event.project) return;
				void offerSetupImport(
					{ hostUrl, projectId, projectName: event.project.name },
					{
						isPromptWindow: () =>
							electronTrpcClient.window.isLastFocusedInOrg.query(),
						waitForFocus,
						isDismissed: (id) =>
							useV2SetupCardDismissalsStore.getState().isDismissed(id),
						hasImport,
						prompt,
					},
					controller.signal,
				).catch((error) => {
					console.warn("[SetupImportOffer] offer failed", { projectId, error });
				});
			},
		);
		const releaseBus = bus.retain();
		return () => {
			controller.abort();
			removeListener();
			releaseBus();
		};
	}, [activeHostUrl]);

	if (!reviewing || !data) return null;
	return (
		<ImportSetupDialog
			open
			onOpenChange={(open) => {
				if (!open) setReviewing(null);
			}}
			hostUrl={reviewing.hostUrl}
			projectId={reviewing.projectId}
			candidates={withChanges(data.candidates)}
			configInvalid={data.configInvalid ?? false}
			linkToSettings
		/>
	);
}
