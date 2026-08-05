"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type Props = {
	href: string;
	children: React.ReactNode;
	title?: string | null;
	className?: string;
	activeClassName?: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const AsideLink = ({
	href,
	children,
	title,
	className,
	activeClassName,
	...props
}: Props) => {
	const pathname = usePathname();
	const isActive = pathname === href;

	return (
		<Link
			href={href}
			title={title ?? undefined}
			className={cn(
				"flex w-full min-w-0 items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
				isActive
					? cn("bg-dither text-accent-foreground", activeClassName)
					: "text-muted-foreground hover:text-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</Link>
	);
};
