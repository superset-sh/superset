import { useOrganizationRole } from "../useOrganizationRole";

export function useIsOrganizationOwner(): boolean {
	return useOrganizationRole() === "owner";
}
