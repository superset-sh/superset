import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";

/**
 * A provider's real logo, for brands react-icons does not carry.
 *
 * `TriggerProvider.icon` is an `IconType`, so this returns a component with
 * that shape rather than an element — call sites keep passing `className` and
 * never learn whether they are rendering an svg or an image. The art comes
 * from `renderer/assets/icons`, the same files the plugin catalog uses, so a
 * brand has one set of marks in the app rather than one per surface.
 *
 * Unlike a glyph these do not inherit `currentColor`, which is correct for a
 * full-colour mark and is why a generic stand-in was never the right answer.
 */
export function brandIcon(source: string, label: string): IconType {
	return function BrandIcon({ className }) {
		return (
			<img
				src={source}
				alt={label}
				// A menu row sets the box; the art fits inside it whatever its
				// aspect ratio, rather than stretching to a square.
				className={cn("shrink-0 object-contain", className)}
			/>
		);
	};
}
