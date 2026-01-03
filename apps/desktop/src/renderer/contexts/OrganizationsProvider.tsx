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
	const { data: organizations, isLoading } =
		trpc.user.myOrganizations.useQuery();

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
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
