"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useState } from "react";
import {
	LuBuilding2,
	LuCheck,
	LuKey,
	LuMail,
	LuShieldCheck,
	LuUser,
} from "react-icons/lu";

import { env } from "@/env";

interface Organization {
	id: string;
	name: string;
}

interface ConsentFormProps {
	clientId: string;
	clientName?: string;
	scopes: string[];
	userName: string;
	organizations: Organization[];
	defaultOrganizationId?: string;
}

const SCOPE_DESCRIPTIONS: Record<
	string,
	{ label: MessageDescriptor; icon: React.ReactNode }
> = {
	openid: {
		label: msg({
			message: "Verify your identity",
		}),
		icon: <LuShieldCheck className="size-4" />,
	},
	profile: {
		label: msg({
			message: "Access your profile information (name, picture)",
		}),
		icon: <LuUser className="size-4" />,
	},
	email: {
		label: msg({
			message: "Access your email address",
		}),
		icon: <LuMail className="size-4" />,
	},
	offline_access: {
		label: msg({
			message: "Stay connected (refresh tokens)",
		}),
		icon: <LuKey className="size-4" />,
	},
};

export function ConsentForm({
	clientId,
	clientName,
	scopes,
	userName,
	organizations,
	defaultOrganizationId,
}: ConsentFormProps) {
	const { t } = useLingui();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedOrgId, setSelectedOrgId] = useState<string>(
		defaultOrganizationId ?? organizations[0]?.id ?? "",
	);

	const showOrgPicker = organizations.length > 1;
	const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

	const handleConsent = async (accept: boolean) => {
		if (accept && !selectedOrgId) {
			setError(
				t({
					message: "Please select an organization",
				}),
			);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			if (accept) {
				// Deliberately not authClient: here the API answers set-active with a
				// redirect back to this page, and better-auth's client navigates on
				// it, cancelling the consent call below before the CLI ever gets its
				// code (#6609).
				const response = await fetch(
					`${env.NEXT_PUBLIC_API_URL}/api/auth/organization/set-active`,
					{
						method: "POST",
						credentials: "include",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ organizationId: selectedOrgId }),
					},
				);
				if (!response.ok) {
					throw new Error("Failed to set organization");
				}
			}

			const { data, error: consentError } = await authClient.oauth2.consent({
				accept,
				scope: accept ? scopes.join(" ") : undefined,
			});

			if (consentError) {
				throw new Error(consentError.message ?? "Failed to process consent");
			}

			if (data?.url) {
				window.location.href = data.url;
			}
		} catch (err) {
			console.error("[oauth/consent] Error:", err);
			setError(
				err instanceof Error
					? err.message
					: t({ message: "An error occurred" }),
			);
			setIsLoading(false);
		}
	};

	const displayName = clientName ?? getClientDisplayName(clientId);

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					<Trans>Authorize {displayName}</Trans>
				</h1>
				<p className="text-muted-foreground text-sm">
					<Trans>
						<span className="font-medium text-foreground">{displayName}</span>{" "}
						is requesting access to your Superset account
					</Trans>
				</p>
			</div>

			<div className="bg-muted/50 rounded-lg border p-4">
				<p className="text-muted-foreground mb-3 text-sm">
					<Trans>
						Signed in as{" "}
						<span className="font-medium text-foreground">{userName}</span>
					</Trans>
				</p>

				{showOrgPicker ? (
					<div className="mb-4">
						<label
							htmlFor="org-select"
							className="mb-2 block text-sm font-medium"
						>
							<Trans>Select organization</Trans>
						</label>
						<Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
							<SelectTrigger id="org-select" className="w-full">
								<SelectValue
									placeholder={t({
										message: "Select an organization",
									})}
								/>
							</SelectTrigger>
							<SelectContent>
								{organizations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										<div className="flex items-center gap-2">
											<LuBuilding2 className="size-4 text-muted-foreground" />
											{org.name}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground mt-1.5 text-xs">
							<Trans>
								This application will have access to data in the selected
								organization.
							</Trans>
						</p>
					</div>
				) : selectedOrg ? (
					<p className="text-muted-foreground mb-3 text-sm">
						<Trans>
							Organization:{" "}
							<span className="font-medium text-foreground">
								{selectedOrg.name}
							</span>
						</Trans>
					</p>
				) : null}

				<p className="mb-2 text-sm font-medium">
					<Trans>This application will be able to:</Trans>
				</p>
				<ul className="space-y-2">
					{scopes.map((scope) => {
						const scopeInfo = SCOPE_DESCRIPTIONS[scope];
						return (
							<li key={scope} className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">
									{scopeInfo?.icon ?? <LuCheck className="size-4" />}
								</span>
								<span>{scopeInfo ? i18n._(scopeInfo.label) : scope}</span>
							</li>
						);
					})}
					<li className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">
							<LuBuilding2 className="size-4" />
						</span>
						<span>
							<Trans>Access your organization data</Trans>
						</span>
					</li>
				</ul>
			</div>

			{error && <p className="text-destructive text-center text-sm">{error}</p>}

			<div className="flex gap-3">
				<Button
					variant="outline"
					className="flex-1"
					disabled={isLoading}
					onClick={() => handleConsent(false)}
				>
					<Trans>Deny</Trans>
				</Button>
				<Button
					className="flex-1"
					disabled={isLoading || !selectedOrgId}
					onClick={() => handleConsent(true)}
				>
					{isLoading ? <Trans>Authorizing...</Trans> : <Trans>Authorize</Trans>}
				</Button>
			</div>

			<p className="text-muted-foreground px-8 text-center text-xs">
				<Trans>
					By authorizing, you allow this application to access your data
					according to its terms of service and privacy policy.
				</Trans>
			</p>
		</div>
	);
}

function getClientDisplayName(clientId: string): string {
	const knownClients: Record<string, string> = {
		"claude-code": "Claude Code",
		"superset-desktop": "Superset Desktop",
	};
	if (knownClients[clientId]) {
		return knownClients[clientId];
	}
	if (clientId.length > 20) {
		return i18n._(
			msg({
				message: "External Application",
			}),
		);
	}
	return clientId;
}
