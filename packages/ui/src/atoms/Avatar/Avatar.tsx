import { getInitials } from "@superset/shared/names";
import { cva, type VariantProps } from "class-variance-authority";
import {
	Avatar as AvatarBase,
	AvatarFallback as AvatarFallbackBase,
	AvatarImage as AvatarImageBase,
} from "../../components/ui/avatar";
import { cn } from "../../lib/utils";

const avatarVariants = cva("", {
	variants: {
		size: {
			xs: "size-5",
			sm: "size-6",
			md: "size-8",
			lg: "size-10",
			xl: "size-12",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const avatarFallbackVariants = cva("", {
	variants: {
		size: {
			xs: "text-[0.625rem]",
			sm: "text-xs",
			md: "text-sm",
			lg: "text-base",
			xl: "text-lg",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

interface AvatarProps extends VariantProps<typeof avatarVariants> {
	fullName?: string | null;
	image?: string | null;
	className?: string;
}

function Avatar({ className, size = "md", fullName, image }: AvatarProps) {
	const fallbackText = fullName ? getInitials(fullName) : "A";

	return (
		<AvatarBase className={cn(avatarVariants({ size }), className)}>
			{image && <AvatarImageBase src={image} />}
			<AvatarFallbackBase className={cn(avatarFallbackVariants({ size }))}>
				{fallbackText}
			</AvatarFallbackBase>
		</AvatarBase>
	);
}

export { Avatar };
export type { AvatarProps };
