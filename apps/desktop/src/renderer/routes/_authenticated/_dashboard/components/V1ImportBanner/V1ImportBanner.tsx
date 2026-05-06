import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuArrowRight, LuX } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { MOCK_ORG_ID } from "shared/constants";

const DISMISS_SESSION_KEY_PREFIX = "v1-import-banner-dismissed";

function dismissKey(organizationId: string): string {
	return `${DISMISS_SESSION_KEY_PREFIX}:${organizationId}`;
}

function readDismissed(organizationId: string | null): boolean {
	if (!organizationId || typeof window === "undefined") return false;
	return sessionStorage.getItem(dismissKey(organizationId)) === "1";
}

export function V1ImportBanner() {
	const { data: session } = authClient.useSession();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const openModal = useOpenV1ImportModal();
	const { activeHostUrl } = useLocalHostService();
	const [dismissed, setDismissed] = useState(() =>
		readDismissed(organizationId),
	);

	useEffect(() => {
		setDismissed(readDismissed(organizationId));
	}, [organizationId]);

	const enabled = isV2CloudEnabled && !!organizationId && !dismissed;

	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery(
		undefined,
		{ enabled },
	);
	const hostProjectListQuery = useQuery({
		queryKey: ["v1-import-banner", "hostProjectList", activeHostUrl],
		queryFn: async () => {
			if (!activeHostUrl) return [];
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.project.list.query();
		},
		enabled: enabled && !!activeHostUrl,
		retry: false,
	});

	if (!isV2CloudEnabled || !organizationId || dismissed) return null;

	const projects = projectsQuery.data ?? [];
	const importedRepoPaths = new Set(
		(hostProjectListQuery.data ?? []).map((p) => p.repoPath),
	);
	const remaining = projects.filter(
		(p) => !importedRepoPaths.has(p.mainRepoPath),
	).length;

	if (remaining === 0) return null;

	const dismiss = () => {
		if (organizationId) {
			sessionStorage.setItem(dismissKey(organizationId), "1");
		}
		setDismissed(true);
	};

	return (
		<div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2">
			<div className="flex-1 text-sm text-foreground">
				You have{" "}
				<span className="font-medium">
					{remaining} v1 project{remaining === 1 ? "" : "s"}
				</span>{" "}
				you can bring over to v2.
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={() => openModal()}
				className="gap-1.5"
			>
				Import from v1
				<LuArrowRight className="size-3.5" strokeWidth={2} />
			</Button>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				onClick={dismiss}
				aria-label="Dismiss"
				className="h-7 w-7"
			>
				<LuX className="size-3.5" strokeWidth={2} />
			</Button>
		</div>
	);
}
