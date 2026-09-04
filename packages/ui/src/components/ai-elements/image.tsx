import { msg } from "@lingui/core/macro";
import type { Experimental_GeneratedImage } from "ai";
import { i18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

export type ImageProps = Experimental_GeneratedImage & {
	className?: string;
	alt?: string;
};

export const Image = ({
	base64,
	uint8Array,
	mediaType,
	...props
}: ImageProps) => (
	<img
		{...props}
		alt={props.alt || i18n._(msg({ message: "Generated image" }))}
		className={cn(
			"h-auto max-w-full overflow-hidden rounded-md",
			props.className,
		)}
		src={`data:${mediaType};base64,${base64}`}
	/>
);
