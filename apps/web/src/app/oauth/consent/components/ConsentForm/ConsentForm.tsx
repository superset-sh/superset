"use client";

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

interface Organization {
	id: string;
	name: string;
}

interface ConsentFormProps {
	consentCode: string;
	clientId: string;
	clientName?: string;
	scopes: string[];
	userName: string;
	organizations: Organization[];
	defaultOrganizationId?: string;
}

const SCOPE_DESCRIPTIONS: Record<
	string,
	{ label: string; icon: React.ReactNode }
> = {
	openid: {
		label: "Verify your identity",
		icon: <LuShieldCheck className="size-4" />,
	},
	profile: {
		label: "Access your profile information (name, picture)",
		icon: <LuUser className="size-4" />,
	},
	email: {
		label: "Access your email address",
		icon: <LuMail className="size-4" />,
	},
	offline_access: {
		label: "Stay connected (refresh tokens)",
		icon: <LuKey className="size-4" />,
	},
};

export function ConsentForm({
	consentCode,
	clientId,
	clientName,
	scopes,
	userName,
	organizations,
	defaultOrganizationId,
}: ConsentFormProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedOrgId, setSelectedOrgId] = useState<string>(
		defaultOrganizationId ?? organizations[0]?.id ?? "",
	);

	const showOrgPicker = organizations.length > 1;
	const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

	const handleConsent = async (accept: boolean) => {
		setIsLoading(true);
		setError(null);

		try {
			// Add organization scope to verification value before consent
			// (Better Auth's consent endpoint doesn't accept scope in body)
			if (accept && selectedOrgId) {
				const addScopeResponse = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}/api/auth/oauth/add-org-scope`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						credentials: "include",
						body: JSON.stringify({
							consent_code: consentCode,
							organizationId: selectedOrgId,
						}),
					},
				);

				if (!addScopeResponse.ok) {
					const data = await addScopeResponse.json();
					throw new Error(data.error || "Failed to set organization scope");
				}
			}

			const response = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/auth/oauth2/consent`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						accept,
						consent_code: consentCode,
					}),
				},
			);

			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					data.error_description || data.message || "Failed to process consent",
				);
			}

			const redirectUrl = data.redirectURI || data.redirectTo;
			if (redirectUrl) {
				window.location.href = redirectUrl;
			}
		} catch (err) {
			console.error("Consent error:", err);
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsLoading(false);
		}
	};

	const displayName = clientName ?? getClientDisplayName(clientId);

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Authorize {displayName}
				</h1>
				<p className="text-muted-foreground text-sm">
					<span className="font-medium text-foreground">{displayName}</span> is
					requesting access to your Superset account
				</p>
			</div>

			<div className="bg-muted/50 rounded-lg border p-4">
				<p className="text-muted-foreground mb-3 text-sm">
					Signed in as{" "}
					<span className="font-medium text-foreground">{userName}</span>
				</p>

				{showOrgPicker ? (
					<div className="mb-4">
						<label
							htmlFor="org-select"
							className="mb-2 block text-sm font-medium"
						>
							Select organization
						</label>
						<Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
							<SelectTrigger id="org-select" className="w-full">
								<SelectValue placeholder="Select an organization" />
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
							This application will have access to data in the selected
							organization.
						</p>
					</div>
				) : selectedOrg ? (
					<p className="text-muted-foreground mb-3 text-sm">
						Organization:{" "}
						<span className="font-medium text-foreground">
							{selectedOrg.name}
						</span>
					</p>
				) : null}

				<p className="mb-2 text-sm font-medium">
					This application will be able to:
				</p>
				<ul className="space-y-2">
					{scopes.map((scope) => {
						const scopeInfo = SCOPE_DESCRIPTIONS[scope];
						return (
							<li key={scope} className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">
									{scopeInfo?.icon ?? <LuCheck className="size-4" />}
								</span>
								<span>{scopeInfo?.label ?? scope}</span>
							</li>
						);
					})}
					<li className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">
							<LuBuilding2 className="size-4" />
						</span>
						<span>Access your organization data</span>
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
					Deny
				</Button>
				<Button
					className="flex-1"
					disabled={isLoading || !selectedOrgId}
					onClick={() => handleConsent(true)}
				>
					{isLoading ? "Authorizing..." : "Authorize"}
				</Button>
			</div>

			<p className="text-muted-foreground px-8 text-center text-xs">
				By authorizing, you allow this application to access your data according
				to its terms of service and privacy policy.
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
		return "External Application";
	}
	return clientId;
}
