import type React from "react";
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

interface AvatarProps
	extends React.ComponentProps<typeof AvatarBase>,
		VariantProps<typeof avatarVariants> {}

interface AvatarFallbackProps
	extends React.ComponentProps<typeof AvatarFallbackBase>,
		VariantProps<typeof avatarFallbackVariants> {}

function Avatar({ className, size, ...props }: AvatarProps) {
	return (
		<AvatarBase
			className={cn(avatarVariants({ size }), className)}
			{...props}
		/>
	);
}

function AvatarImage(props: React.ComponentProps<typeof AvatarImageBase>) {
	return <AvatarImageBase {...props} />;
}

function AvatarFallback({
	className,
	size,
	...props
}: AvatarFallbackProps) {
	return (
		<AvatarFallbackBase
			className={cn(avatarFallbackVariants({ size }), className)}
			{...props}
		/>
	);
}

export { Avatar, AvatarImage, AvatarFallback };
export type { AvatarProps, AvatarFallbackProps };
