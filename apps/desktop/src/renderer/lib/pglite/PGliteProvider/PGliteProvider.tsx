import { PGliteProvider as BasePGliteProvider } from "@electric-sql/pglite-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import {
	type Organization,
	useOrganizations,
} from "renderer/contexts/OrganizationsProvider";
import { trpc } from "renderer/lib/trpc";
import { useOrganizationDatabase } from "./hooks";

const ACTIVE_ORG_KEY = "superset_active_organization_id";

interface PGliteContextValue {
	activeOrganization: Organization;
	switchOrganization: (organizationId: string) => void;
}

const PGliteContext = createContext<PGliteContextValue | null>(null);

export function useActiveOrganization() {
	const ctx = useContext(PGliteContext);
	if (!ctx)
		throw new Error("useActiveOrganization must be used within PGliteProvider");
	return ctx;
}

export function PGliteProvider({ children }: { children: ReactNode }) {
	const organizations = useOrganizations();
	const [accessToken, setAccessToken] = useState<string | null>(null);

	// Initialize activeOrganizationId synchronously from localStorage
	const [activeOrganizationId, setActiveOrganizationId] = useState<string>(
		() => {
			const stored = localStorage.getItem(ACTIVE_ORG_KEY);
			const valid = organizations.find((o) => o.id === stored);
			return valid?.id ?? organizations[0].id;
		},
	);

	// Should be guaranteed by the useState above
	const activeOrganization = organizations.find(
		(o) => o.id === activeOrganizationId,
	);
	if (!activeOrganization) {
		throw new Error(`Active organization not found: ${activeOrganizationId}.`);
	}

	// Subscribe to access token
	trpc.auth.onAccessToken.useSubscription(undefined, {
		onData: ({ accessToken }) => setAccessToken(accessToken),
	});

	// Database + sync for active organization
	const dbState = useOrganizationDatabase(activeOrganizationId, accessToken);

	// Switch organization
	const switchOrganization = (newOrganizationId: string) => {
		localStorage.setItem(ACTIVE_ORG_KEY, newOrganizationId);
		setActiveOrganizationId(newOrganizationId);
	};

	// Loading state
	if (!dbState) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<PGliteContext.Provider value={{ activeOrganization, switchOrganization }}>
			<BasePGliteProvider db={dbState.pg}>{children}</BasePGliteProvider>
		</PGliteContext.Provider>
	);
}
