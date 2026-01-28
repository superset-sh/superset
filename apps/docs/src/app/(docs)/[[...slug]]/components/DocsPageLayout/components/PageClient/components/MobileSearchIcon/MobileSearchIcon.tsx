"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface MobileSearchIconProps {
	className?: string;
}

export function MobileSearchIcon({ className }: MobileSearchIconProps) {
	const { setOpenSearch } = useSearchContext();

	const handleSearchClick = () => {
		setOpenSearch(true);
	};

	return (
		<button
			type="button"
			aria-label="Search"
			onClick={handleSearchClick}
			className={cn(
				"flex items-center justify-center size-8 p-2 navbar:hidden hover:text-foreground transition-colors",
				className,
			)}
		>
			<Search className="size-4" />
		</button>
	);
}
