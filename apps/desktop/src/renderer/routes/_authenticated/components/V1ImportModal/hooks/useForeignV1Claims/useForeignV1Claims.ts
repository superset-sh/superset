import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	foreignV1Claims,
	type V1ForeignClaims,
	type V1LedgerOwner,
} from "renderer/lib/v1-migration/ownership";

const NO_OWNERS: V1LedgerOwner[] = [];

export function useForeignV1Claims(
	organizationId: string,
): V1ForeignClaims | null {
	const ownersQuery = electronTrpc.migration.ledgerOwners.useQuery();
	// A failed read must not lock the user out of the manual importer.
	const owners = ownersQuery.isError ? NO_OWNERS : ownersQuery.data;
	return useMemo(
		() => (owners ? foreignV1Claims(owners, organizationId) : null),
		[owners, organizationId],
	);
}
