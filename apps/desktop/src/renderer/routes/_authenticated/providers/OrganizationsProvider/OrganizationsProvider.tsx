import { createContext, type ReactNode, useContext } from "react";
import { type RouterOutputs, trpc } from "renderer/lib/trpc";

export type Organization = RouterOutputs["user"]["myOrganizations"][number];

interface OrganizationsContextValue {
	organizations: Organization[];
}

const OrganizationsContext = createContext<OrganizationsContextValue | null>(
	null,
);

export function useOrganizations(): Organization[] {
	const ctx = useContext(OrganizationsContext);
	if (!ctx)
		throw new Error(
			"useOrganizations must be used within OrganizationsProvider",
		);
	return ctx.organizations;
}

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const {
		data: organizations,
		isLoading,
		error,
	} = trpc.user.myOrganizations.useQuery();

	if (isLoading) {
		return null;
	}

	if (error) {
		console.error(
			"[OrganizationsProvider] Error loading organizations:",
			error,
		);
		return (
			<div className="p-4 text-destructive">Failed to load organizations</div>
		);
	}

	if (!organizations?.length) {
		return <div className="p-4 text-destructive">No organizations found</div>;
	}

	return (
		<OrganizationsContext.Provider value={{ organizations }}>
			{children}
		</OrganizationsContext.Provider>
	);
}
