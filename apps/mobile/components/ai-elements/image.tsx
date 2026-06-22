import { Image as ExpoImage } from "expo-image";
import { withUniwind } from "uniwind";
import { cn } from "@/lib/utils";

const StyledImage = withUniwind(ExpoImage);

export type GeneratedImageData = {
	base64: string;
	mediaType: string;
};

export type ImageProps = GeneratedImageData &
	Omit<React.ComponentProps<typeof StyledImage>, "source"> & {
		alt?: string;
	};

export const Image = ({
	base64,
	mediaType,
	className,
	...props
}: ImageProps) => (
	<StyledImage
		accessibilityLabel={props.alt}
		className={cn(
			"aspect-square w-full max-w-full overflow-hidden rounded-md",
			className,
		)}
		source={{ uri: `data:${mediaType};base64,${base64}` }}
		{...props}
	/>
);
