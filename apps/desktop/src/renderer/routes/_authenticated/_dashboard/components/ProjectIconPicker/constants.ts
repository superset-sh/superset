import { ENTITY_COLORS } from "@superset/shared/entity-colors";

/** No color first, then the palette: the two rows of five every color choice shows. */
export const PROJECT_COLOR_OPTIONS: (string | null)[] = [
	null,
	...ENTITY_COLORS,
];
