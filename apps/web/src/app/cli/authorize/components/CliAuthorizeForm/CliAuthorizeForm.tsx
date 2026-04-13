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
import { LuBuilding2 } from "react-icons/lu";

interface Organization {
	id: string;
	name: string;
}

interface CliAuthorizeFormProps {
	state: string;
	redirectUri: string;
	userName: string;
	organizations: Organization[];
	apiUrl: string;
}

export function CliAuthorizeForm({
	state,
	redirectUri,
	userName,
	organizations,
	apiUrl,
}: CliAuthorizeFormProps) {
	const [selectedOrgId, setSelectedOrgId] = useState(
		organizations[0]?.id ?? "",
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

	const handleAuthorize = async () => {
		if (!selectedOrgId) {
			setError("Please select an organization");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch(`${apiUrl}/api/cli/create-code`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ organizationId: selectedOrgId }),
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				throw new Error(data.error ?? `Failed: ${res.status}`);
			}

			const { code } = (await res.json()) as { code: string };

			const url = new URL(redirectUri);
			url.searchParams.set("code", code);
			url.searchParams.set("state", state);
			window.location.href = url.toString();
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsLoading(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Authorize Superset CLI
				</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to the CLI as{" "}
					<span className="font-medium text-foreground">{userName}</span>
				</p>
			</div>

			<div className="bg-muted/50 rounded-lg border p-4">
				{organizations.length > 1 ? (
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
					</div>
				) : selectedOrg ? (
					<p className="text-muted-foreground mb-3 text-sm">
						Organization:{" "}
						<span className="font-medium text-foreground">
							{selectedOrg.name}
						</span>
					</p>
				) : null}
			</div>

			{error && <p className="text-destructive text-center text-sm">{error}</p>}

			<Button
				className="w-full"
				disabled={isLoading || !selectedOrgId}
				onClick={handleAuthorize}
			>
				{isLoading ? "Authorizing..." : "Authorize"}
			</Button>

			<p className="text-muted-foreground px-8 text-center text-xs">
				This will create a CLI session for the selected organization.
			</p>
		</div>
	);
}
