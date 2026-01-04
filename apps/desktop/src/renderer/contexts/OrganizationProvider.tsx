import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import { useOrganizations } from "./OrganizationsProvider";

const ACTIVE_ORG_KEY = "superset_active_organization_id";

interface OrganizationContextValue {
	activeOrganizationId: string;
	activeOrganization: ReturnType<typeof useOrganizations>[number];
	switchOrganization: (orgId: string) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(
	null,
);

export function OrganizationProvider({ children }: { children: ReactNode }) {
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

	const switchOrganization = useCallback(
		(newOrgId: string) => {
			console.log(
				"[OrganizationProvider] Switching from",
				activeOrganizationId,
				"to:",
				newOrgId,
			);
			localStorage.setItem(ACTIVE_ORG_KEY, newOrgId);
			setActiveOrganizationId(newOrgId);
		},
		[activeOrganizationId],
	);

	const value: OrganizationContextValue = {
		activeOrganizationId,
		activeOrganization,
		switchOrganization,
	};

	return (
		<OrganizationContext.Provider value={value}>
			{children}
		</OrganizationContext.Provider>
	);
}

export const useOrganization = () => {
	const context = useContext(OrganizationContext);
	if (!context) {
		throw new Error("useOrganization must be used within OrganizationProvider");
	}
	return context;
};

// Convenience hook to maintain compatibility with old useActiveOrganization
export const useActiveOrganization = () => {
	const { activeOrganization, switchOrganization } = useOrganization();
	return { activeOrganization, switchOrganization };
};
