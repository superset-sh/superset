import type { ImagePart } from "@superset/chat/shared";
import type { PartProps } from "./parts";

function basename(path: string): string {
	const trimmed = path.replace(/\\/g, "/");
	const slash = trimmed.lastIndexOf("/");
	return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export function ImagePartView({ part }: PartProps<ImagePart>) {
	const alt = part.filename ? basename(part.filename) : "attached image";
	return (
		<img
			src={part.url}
			className="border-border-weak my-1 max-h-48 rounded-md border object-contain"
			alt={alt}
		/>
	);
}
