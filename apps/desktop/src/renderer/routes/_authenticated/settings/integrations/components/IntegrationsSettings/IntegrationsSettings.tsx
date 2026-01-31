import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { useCallback, useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiCheckCircle, HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface IntegrationsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

interface IntegrationConnection {
	id: string;
	provider: string;
	externalOrgId: string | null;
	externalOrgName: string | null;
	config: unknown;
	createdAt: Date;
	updatedAt: Date;
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

	const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
	const [githubInstallation, setGithubInstallation] =
		useState<GithubInstallation | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const showLinear = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_LINEAR,
		visibleItems,
	);
	const showGithub = isItemVisible(
		SETTING_ITEM_ID.INTEGRATIONS_GITHUB,
		visibleItems,
	);

	const fetchIntegrations = useCallback(async () => {
		if (!activeOrganizationId) {
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const [integrationsResult, githubResult] = await Promise.all([
				apiTrpcClient.integration.list.query({
					organizationId: activeOrganizationId,
				}),
				apiTrpcClient.integration.github.getInstallation.query({
					organizationId: activeOrganizationId,
				}),
			]);
			setIntegrations(integrationsResult);
			setGithubInstallation(githubResult);
		} catch (err) {
			console.error("[integrations] Failed to fetch integrations:", err);
			setError("Failed to load integrations");
		} finally {
			setIsLoading(false);
		}
	}, [activeOrganizationId]);

	useEffect(() => {
		fetchIntegrations();
	}, [fetchIntegrations]);

	const linearConnection = integrations.find((i) => i.provider === "linear");
	const isLinearConnected = !!linearConnection;
	const isGithubConnected =
		!!githubInstallation && !githubInstallation.suspended;

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

			{error && (
				<div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-md text-sm">
					{error}
				</div>
			)}

			<div className="grid gap-4">
				{showLinear && (
					<IntegrationCard
						name="Linear"
						description="Sync issues bidirectionally with Linear"
						icon={<SiLinear className="size-6" />}
						isConnected={isLinearConnected}
						connectedOrgName={linearConnection?.externalOrgName}
						isLoading={isLoading}
						onManage={() => handleOpenWeb("/integrations/linear")}
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
						onManage={() => handleOpenWeb("/integrations/github")}
					/>
				)}
			</div>

			<p className="mt-6 text-xs text-muted-foreground">
				Manage integrations in the web app to connect and configure services.
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
