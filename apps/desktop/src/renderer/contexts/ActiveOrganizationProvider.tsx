import { createContext, type ReactNode, useContext, useState } from "react";
import { useOrganizations } from "./OrganizationsProvider";

const ACTIVE_ORG_KEY = "superset_active_organization_id";

interface ActiveOrganizationContextValue {
	activeOrganizationId: string;
	activeOrganization: ReturnType<typeof useOrganizations>[number];
	switchOrganization: (orgId: string) => void;
}

const ActiveOrganizationContext =
	createContext<ActiveOrganizationContextValue | null>(null);

export function ActiveOrganizationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const organizations = useOrganizations();

	const [activeOrganizationId, setActiveOrganizationId] = useState<string>(
		() => {
			const stored = localStorage.getItem(ACTIVE_ORG_KEY);
			const valid = organizations.find((o) => o.id === stored);
			return valid?.id ?? organizations[0].id;
		},
	);

	const activeOrganization = organizations.find(
		(o) => o.id === activeOrganizationId,
	);
	if (!activeOrganization) {
		throw new Error(`Active organization not found: ${activeOrganizationId}.`);
	}

	const switchOrganization = (newOrgId: string) => {
		localStorage.setItem(ACTIVE_ORG_KEY, newOrgId);
		setActiveOrganizationId(newOrgId);
	};

	const value: ActiveOrganizationContextValue = {
		activeOrganizationId,
		activeOrganization,
		switchOrganization,
	};

	return (
		<ActiveOrganizationContext.Provider value={value}>
			{children}
		</ActiveOrganizationContext.Provider>
	);
}

export const useActiveOrganization = () => {
	const context = useContext(ActiveOrganizationContext);
	if (!context) {
		throw new Error(
			"useActiveOrganization must be used within ActiveOrganizationProvider",
		);
	}
	return context;
};
