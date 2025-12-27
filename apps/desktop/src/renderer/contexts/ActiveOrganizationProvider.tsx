import { createContext, type ReactNode, useContext, useEffect } from "react";
import {
	setActiveOrganizationId,
	useActiveOrganizationIdQuery,
	useOrganizations,
} from "renderer/lib/pglite";
import { trpc } from "renderer/lib/trpc";

interface ActiveOrganizationContextValue {
	activeOrganizationId: string;
}

const ActiveOrganizationContext =
	createContext<ActiveOrganizationContextValue | null>(null);

export function ActiveOrganizationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { data: user } = trpc.user.me.useQuery();
	const orgsResult = useOrganizations(user?.id ?? "");
	const organizations = orgsResult?.rows;
	const { activeOrganizationId, isLoaded: isActiveOrgLoaded } =
		useActiveOrganizationIdQuery();

	// Auto-select first org if none selected (only after both queries loaded)
	useEffect(() => {
		if (isActiveOrgLoaded && !activeOrganizationId && organizations?.length) {
			setActiveOrganizationId(organizations[0].id);
		}
	}, [isActiveOrgLoaded, activeOrganizationId, organizations]);

	// Wait for both queries to finish loading
	const orgsLoaded = orgsResult !== undefined;
	if (!orgsLoaded || !isActiveOrgLoaded) {
		return null;
	}

	// Use activeOrganizationId if set, otherwise fall back to first org
	const effectiveOrgId = activeOrganizationId ?? organizations?.[0]?.id;

	if (!effectiveOrgId) {
		// No orgs synced yet - children will show empty states
		return null;
	}

	return (
		<ActiveOrganizationContext.Provider
			value={{ activeOrganizationId: effectiveOrgId }}
		>
			{children}
		</ActiveOrganizationContext.Provider>
	);
}

export function useActiveOrganizationId(): string {
	const context = useContext(ActiveOrganizationContext);
	if (!context) {
		throw new Error(
			"useActiveOrganizationId must be used within ActiveOrganizationProvider",
		);
	}
	return context.activeOrganizationId;
}
