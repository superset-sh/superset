import type { Item, KnownItem } from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";

export type RowKind = KnownItem["kind"] | "unknown";

export function rowKindForItem(item: Item): RowKind {
	return isKnownItem(item) ? item.kind : "unknown";
}
