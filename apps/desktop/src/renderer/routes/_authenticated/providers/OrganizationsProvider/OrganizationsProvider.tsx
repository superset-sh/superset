import type { AppRouter } from "@superset/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { createContext, type ReactNode, useContext } from "react";
import { trpc } from "renderer/lib/trpc";

type ApiRouterOutputs = inferRouterOutputs<AppRouter>;
export type Organization = ApiRouterOutputs["user"]["myOrganizations"][number];

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
