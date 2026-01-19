"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type Props = {
	href: string;
	children: React.ReactNode;
	startWith: string;
	title?: string | null;
	className?: string;
	activeClassName?: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const AsideLink = ({
	href,
	children,
	startWith,
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
			className={cn(
				isActive
					? cn("text-foreground bg-primary/10", activeClassName)
					: "text-muted-foreground hover:text-foreground hover:bg-primary/10",
				"w-full transition-colors flex items-center gap-x-2.5 hover:bg-primary/10 px-5 py-1",
				className,
			)}
			{...props}
		>
			{children}
		</Link>
	);
};
