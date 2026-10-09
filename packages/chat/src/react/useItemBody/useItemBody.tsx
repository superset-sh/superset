import { createContext, type ReactNode, useContext, useEffect } from "react";
import { hasOmittedBody } from "../../core";
import type { Item } from "../../protocol/items";

type RequestItemBodies = (itemIds: readonly string[]) => void;

const ItemBodiesContext = createContext<RequestItemBodies | null>(null);

export function ItemBodiesProvider({
	children,
	requestItemBodies,
}: {
	children: ReactNode;
	requestItemBodies: RequestItemBodies;
}) {
	return (
		<ItemBodiesContext.Provider value={requestItemBodies}>
			{children}
		</ItemBodiesContext.Provider>
	);
}

export function useItemBody(item: Item): void {
	const requestItemBodies = useContext(ItemBodiesContext);
	const omitted = hasOmittedBody(item);
	useEffect(() => {
		if (omitted) requestItemBodies?.([item.id]);
	}, [omitted, item.id, requestItemBodies]);
}
