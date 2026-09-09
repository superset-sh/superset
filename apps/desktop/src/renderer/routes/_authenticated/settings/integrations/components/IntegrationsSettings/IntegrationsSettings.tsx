import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	type IntegrationProvider,
	offeredIntegrations,
} from "@superset/shared/integrations";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useFeatureFlagPayload } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BsMicrosoftTeams } from "react-icons/bs";
import { FaGithub, FaGoogle, FaSlack } from "react-icons/fa";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { SiLinear, SiNotion, SiSentry } from "react-icons/si";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	integrationSettingItemId,
	isItemVisible,
	type SettingItemId,
} from "../../../utils/settings-search";

interface IntegrationsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

interface GithubInstallation {
	id: string;
	accountLogin: string | null;
	accountType: string | null;
	suspended: boolean | null;
	lastSyncedAt: Date | null;
	createdAt: Date;
}

const INTEGRATION_ICONS: Record<IntegrationProvider, React.ReactNode> = {
	linear: <SiLinear className="size-5" />,
	github: <FaGithub className="size-5" />,
	slack: <FaSlack className="size-5" />,
	notion: <SiNotion className="size-5" />,
	microsoft_teams: <BsMicrosoftTeams className="size-5" />,
	sentry: <SiSentry className="size-5" />,
	google: <FaGoogle className="size-5" />,
};

interface ProviderState {
	isConnected: boolean;
	connectedOrgName?: string | null;
	isLoading: boolean;
}

export function IntegrationsSettings({
	visibleItems,
}: IntegrationsSettingsProps) {
	// Per-window org, not the shared session: the session holds one org for
	// the whole app, so a second window on another org would render this
	// window against the other one's organization.
	const activeOrganizationId = useActiveOrganizationId();
	const searchQuery = useSettingsSearchQuery();

	const enabledTriggerKinds = useFeatureFlagPayload(
		FEATURE_FLAGS.AUTOMATION_EVENT_TRIGGERS,
	);
	const offered = useMemo(
		() => offeredIntegrations(enabledTriggerKinds),
		[enabledTriggerKinds],
	);

	const { data: integrations, isPending: isIntegrationsPending } =
		cloudTrpc.integration.list.useQuery(
			{ organizationId: activeOrganizationId ?? "" },
			{ enabled: !!activeOrganizationId },
		);

	// Google is per member, not per org, so the caller's own connection rather
	// than whichever row integration.list happens to return first.
	const { data: googleConnection, isPending: isGooglePending } =
		cloudTrpc.integration.google.getConnection.useQuery(
			{ organizationId: activeOrganizationId ?? "" },
			{ enabled: !!activeOrganizationId },
		);

	// These three keep a disconnected row around, which integration.list does
	// not filter out — their per-provider getConnection does.
	const { data: sentryConnection, isPending: isSentryPending } =
		cloudTrpc.integration.sentry.getConnection.useQuery(
			{ organizationId: activeOrganizationId ?? "" },
			{ enabled: !!activeOrganizationId },
		);
	const { data: notionConnection, isPending: isNotionPending } =
		cloudTrpc.integration.notion.getConnection.useQuery(
			{ organizationId: activeOrganizationId ?? "" },
			{ enabled: !!activeOrganizationId },
		);
	const { data: teamsConnection, isPending: isTeamsPending } =
		cloudTrpc.integration.microsoftTeams.getConnection.useQuery(
			{ organizationId: activeOrganizationId ?? "" },
			{ enabled: !!activeOrganizationId },
		);

	const [githubInstallation, setGithubInstallation] =
		useState<GithubInstallation | null>(null);
	const [isLoadingGithub, setIsLoadingGithub] = useState(true);

	const fetchGithubInstallation = useCallback(async () => {
		if (!activeOrganizationId) {
			setIsLoadingGithub(false);
			return;
		}

		try {
			const result =
				await apiTrpcClient.integration.github.getInstallation.query({
					organizationId: activeOrganizationId,
				});
			setGithubInstallation(result);
		} catch (err) {
			console.error("[integrations] Failed to fetch GitHub installation:", err);
		} finally {
			setIsLoadingGithub(false);
		}
	}, [activeOrganizationId]);

	useEffect(() => {
		fetchGithubInstallation();
	}, [fetchGithubInstallation]);

	const linearConnection = integrations?.find((i) => i.provider === "linear");
	const slackConnection = integrations?.find((i) => i.provider === "slack");

	const providerStates: Record<IntegrationProvider, ProviderState> = {
		linear: {
			isConnected: !!linearConnection,
			connectedOrgName: linearConnection?.externalOrgName,
			isLoading: isIntegrationsPending,
		},
		github: {
			isConnected: !!githubInstallation && !githubInstallation.suspended,
			connectedOrgName: githubInstallation?.accountLogin,
			isLoading: isLoadingGithub,
		},
		slack: {
			isConnected: !!slackConnection,
			connectedOrgName: slackConnection?.externalOrgName,
			isLoading: isIntegrationsPending,
		},
		notion: {
			isConnected: !!notionConnection,
			connectedOrgName: notionConnection?.externalOrgName,
			isLoading: isNotionPending,
		},
		microsoft_teams: {
			isConnected: !!teamsConnection,
			connectedOrgName: teamsConnection?.externalOrgName,
			isLoading: isTeamsPending,
		},
		sentry: {
			isConnected: !!sentryConnection,
			connectedOrgName: sentryConnection?.organizationName,
			isLoading: isSentryPending,
		},
		google: {
			isConnected: !!googleConnection && !googleConnection.needsReconnect,
			connectedOrgName: googleConnection?.email,
			isLoading: isGooglePending,
		},
	};

	const handleOpenWeb = (path: string) => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}${path}`, "_blank");
	};

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">
						<Trans>Integrations</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>Connect external services to sync data.</Trans>
					</p>
				</div>
				<p className="text-sm text-muted-foreground">
					<Trans>
						You need to be part of an organization to use integrations.
					</Trans>
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Integrations</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>
						Connect external services to sync data with your organization.
					</Trans>
				</p>
			</div>

			<div className="space-y-1">
				{offered.map((integration) => {
					const itemId = integrationSettingItemId(integration.provider);
					if (!isItemVisible(itemId, visibleItems)) return null;
					const state = providerStates[integration.provider];
					return (
						<IntegrationRow
							key={integration.provider}
							name={
								<HighlightText text={integration.label} query={searchQuery} />
							}
							description={integration.description()}
							icon={INTEGRATION_ICONS[integration.provider]}
							isConnected={state.isConnected}
							connectedOrgName={state.connectedOrgName}
							isLoading={state.isLoading}
							onManage={() => handleOpenWeb(integration.webPath)}
						/>
					);
				})}
			</div>

			<p className="mt-6 text-xs text-muted-foreground">
				<Trans>
					Manage integrations in the web app to connect and configure services.
				</Trans>
			</p>
		</div>
	);
}

interface IntegrationRowProps {
	name: React.ReactNode;
	description: string;
	icon: React.ReactNode;
	isConnected: boolean;
	connectedOrgName?: string | null;
	isLoading?: boolean;
	onManage: () => void;
}

function IntegrationRow({
	name,
	description,
	icon,
	isConnected,
	connectedOrgName,
	isLoading,
	onManage,
}: IntegrationRowProps) {
	const status = isLoading ? (
		<Skeleton className="h-4 w-24" />
	) : (
		<div className="flex items-center gap-1.5">
			<span
				className={
					isConnected
						? "size-2 rounded-full bg-green-500"
						: "size-2 rounded-full bg-muted-foreground/30"
				}
			/>
			<span className="text-xs text-muted-foreground">
				{isConnected ? (
					connectedOrgName ? (
						<Trans>Connected to {connectedOrgName}</Trans>
					) : (
						<Trans>Connected</Trans>
					)
				) : (
					<Trans>Not connected</Trans>
				)}
			</span>
		</div>
	);

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex size-8 shrink-0 items-center justify-center text-foreground">
					{icon}
				</div>
				<div className="min-w-0">
					<div className="text-sm font-medium">{name}</div>
					<div className="text-xs text-muted-foreground mt-0.5 truncate">
						{description}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3 shrink-0">
				{status}
				<Button
					variant="outline"
					size="sm"
					onClick={onManage}
					className="gap-2"
				>
					<HiOutlineArrowTopRightOnSquare className="size-4" />
					{isConnected ? <Trans>Manage</Trans> : <Trans>Connect</Trans>}
				</Button>
			</div>
		</div>
	);
}
