import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useHasTrialed(): boolean {
	const collections = useCollections();
	const { data } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);
	return Boolean(data?.some((s) => s.trialEnd != null));
}
