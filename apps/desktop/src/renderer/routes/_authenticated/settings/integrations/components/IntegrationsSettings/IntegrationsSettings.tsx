import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { FaGithub, FaSlack } from "react-icons/fa";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
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

export function IntegrationsSettings({
	visibleItems,
}: IntegrationsSettingsProps) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const collections = useCollections();

	const { data: integrations } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const [githubInstallation, setGithubInstallation] =
		useState<GithubInstallation | null>(null);
	const [isLoadingGithub, setIsLoadingGithub] = useState(true);

	const hasSlackAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.SLACK_INTEGRATION_ACCESS,
	);

	const showLinear = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_LINEAR,
		visibleItems,
	);
	const showGithub = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_GITHUB,
		visibleItems,
	);

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
	const isLinearConnected = !!linearConnection;
	const isSlackConnected = !!slackConnection;
	const isGithubConnected =
		!!githubInstallation && !githubInstallation.suspended;
	const showSlack =
		hasSlackAccess &&
		isItemVisible(SETTING_ITEM_ID.INTEGRATIONS_SLACK, visibleItems);

	const handleOpenWeb = (path: string) => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}${path}`, "_blank");
	};

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Integrations</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Connect external services to sync data.
					</p>
				</div>
				<p className="text-sm text-muted-foreground">
					You need to be part of an organization to use integrations.
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Integrations</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Connect external services to sync data with your organization.
				</p>
			</div>

			<div className="space-y-1">
				{showLinear && (
					<IntegrationRow
						name="Linear"
						description="Sync issues bidirectionally with Linear."
						icon={<SiLinear className="size-5" />}
						isConnected={isLinearConnected}
						connectedOrgName={linearConnection?.externalOrgName}
						onManage={() => handleOpenWeb("/integrations/linear")}
					/>
				)}

				{showGithub && (
					<IntegrationRow
						name="GitHub"
						description="Connect repos and sync pull requests."
						icon={<FaGithub className="size-5" />}
						isConnected={isGithubConnected}
						connectedOrgName={githubInstallation?.accountLogin}
						isLoading={isLoadingGithub}
						onManage={() => handleOpenWeb("/integrations/github")}
					/>
				)}

				{showSlack && (
					<IntegrationRow
						name="Slack"
						description="Manage tasks from Slack conversations."
						icon={<FaSlack className="size-5" />}
						isConnected={isSlackConnected}
						connectedOrgName={slackConnection?.externalOrgName}
						onManage={() => handleOpenWeb("/integrations/slack")}
					/>
				)}
			</div>

			<p className="mt-6 text-xs text-muted-foreground">
				Manage integrations in the web app to connect and configure services.
			</p>
		</div>
	);
}

interface IntegrationRowProps {
	name: string;
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
				{isConnected
					? connectedOrgName
						? `Connected to ${connectedOrgName}`
						: "Connected"
					: "Not connected"}
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
					{isConnected ? "Manage" : "Connect"}
				</Button>
			</div>
		</div>
	);
}
