import { COMPANY, FEATURE_FLAGS } from "@superset/shared/constants";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { FaGithub, FaSlack } from "react-icons/fa";
import { HiCheckCircle, HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import {
	GATED_FEATURES,
	usePaywall,
} from "renderer/components/Paywall/usePaywall";
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
	const { gateFeature } = usePaywall();

	const { data: integrations, isLoading: isLoadingIntegrations } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => integrationConnections),
		[collections],
	);

	const [githubInstallation, setGithubInstallation] =
		useState<GithubInstallation | null>(null);
	const [isLoadingGithub, setIsLoadingGithub] = useState(true);

	const hasGithubAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.GITHUB_INTEGRATION_ACCESS,
	);

	const showLinear = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_LINEAR,
		visibleItems,
	);
	const showGithub =
		hasGithubAccess &&
		isItemVisible(SETTING_ITEM_ID.INTEGRATIONS_GITHUB, visibleItems);

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
	const isLoading = isLoadingIntegrations || isLoadingGithub;

	const showSlack = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_SLACK,
		visibleItems,
	);

	const handleOpenWeb = (path: string) => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}${path}`, "_blank");
	};

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Integrations</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Connect external services to sync data
					</p>
				</div>
				<p className="text-muted-foreground">
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
					Connect external services to sync data with your organization
				</p>
			</div>

			<div className="grid gap-4">
				{showLinear && (
					<IntegrationCard
						name="Linear"
						description="Sync issues bidirectionally with Linear"
						icon={<SiLinear className="size-6" />}
						isConnected={isLinearConnected}
						connectedOrgName={linearConnection?.externalOrgName}
						isLoading={isLoading}
						onManage={() =>
							gateFeature(GATED_FEATURES.INTEGRATIONS, () =>
								handleOpenWeb("/integrations/linear"),
							)
						}
					/>
				)}

				{showGithub && (
					<IntegrationCard
						name="GitHub"
						description="Connect repos and sync pull requests"
						icon={<FaGithub className="size-6" />}
						isConnected={isGithubConnected}
						connectedOrgName={githubInstallation?.accountLogin}
						isLoading={isLoading}
						onManage={() =>
							gateFeature(GATED_FEATURES.INTEGRATIONS, () =>
								handleOpenWeb("/integrations/github"),
							)
						}
					/>
				)}

				{showSlack && (
					<IntegrationCard
						name="Slack"
						description="Manage tasks from Slack conversations"
						icon={<FaSlack className="size-6" />}
						isConnected={isSlackConnected}
						connectedOrgName={slackConnection?.externalOrgName}
						isLoading={isLoading}
						onManage={() =>
							gateFeature(GATED_FEATURES.INTEGRATIONS, () =>
								handleOpenWeb("/integrations/slack"),
							)
						}
					/>
				)}
			</div>

			<p className="mt-6 text-xs text-muted-foreground">
				Manage integrations in the web app to connect and configure services.{" "}
				<a
					href={`${COMPANY.DOCS_URL}/integrations`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-primary hover:underline"
				>
					Learn more
					<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
				</a>
			</p>
		</div>
	);
}

interface IntegrationCardProps {
	name: string;
	description: string;
	icon: React.ReactNode;
	isConnected: boolean;
	connectedOrgName?: string | null;
	isLoading: boolean;
	onManage: () => void;
	comingSoon?: boolean;
}

function IntegrationCard({
	name,
	description,
	icon,
	isConnected,
	connectedOrgName,
	isLoading,
	onManage,
	comingSoon,
}: IntegrationCardProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
							{icon}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<span className="font-medium">{name}</span>
								{isLoading ? (
									<Skeleton className="h-5 w-20" />
								) : isConnected ? (
									<Badge variant="default" className="gap-1">
										<HiCheckCircle className="size-3" />
										Connected
									</Badge>
								) : comingSoon ? (
									<Badge variant="outline">Coming Soon</Badge>
								) : (
									<Badge variant="secondary">Not Connected</Badge>
								)}
							</div>
							<CardDescription className="mt-0.5">
								{description}
							</CardDescription>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={onManage}
						disabled={comingSoon}
						className="gap-2"
					>
						<HiOutlineArrowTopRightOnSquare className="size-4" />
						{isConnected ? "Manage" : "Connect"}
					</Button>
				</div>
			</CardHeader>
			{isConnected && connectedOrgName && (
				<CardContent className="pt-0">
					<p className="text-sm text-muted-foreground">
						Connected to <span className="font-medium">{connectedOrgName}</span>
					</p>
				</CardContent>
			)}
		</Card>
	);
}
