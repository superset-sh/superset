"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { sections } from "@/app/(docs)/components/Sidebar/components/SidebarContent";
import { cn } from "@/lib/cn";

interface NavbarMobileContextProps {
	isOpen: boolean;
	toggleNavbar: () => void;
}

const NavbarContext = createContext<NavbarMobileContextProps | undefined>(
	undefined,
);

export const NavbarProvider = ({ children }: { children: React.ReactNode }) => {
	const [isOpen, setIsOpen] = useState(false);

	const toggleNavbar = () => {
		setIsOpen((prevIsOpen) => !prevIsOpen);
	};

	return (
		<NavbarContext.Provider value={{ isOpen, toggleNavbar }}>
			{children}
		</NavbarContext.Provider>
	);
};

export const useNavbarMobile = (): NavbarMobileContextProps => {
	const context = useContext(NavbarContext);
	if (!context) {
		throw new Error(
			"useNavbarMobile must be used within a NavbarMobileProvider",
		);
	}
	return context;
};

export const NavigationMobile = () => {
	const { isOpen, toggleNavbar } = useNavbarMobile();
	const pathname = usePathname();

	return (
		<div
			className={cn(
				"fixed top-[56px] inset-x-0 transform-gpu z-[100] bg-background grid grid-rows-[0fr] duration-300 transition-all navbar:hidden",
				isOpen && "shadow-lg border-b border-border grid-rows-[1fr]",
			)}
		>
			<div
				className={cn(
					"px-4 min-h-0 overflow-y-auto max-h-[80vh] divide-y transition-all duration-300",
					isOpen ? "py-5" : "invisible",
				)}
			>
				{sections.map((section) => (
					<div key={section.title} className="py-2">
						<div className="flex items-center gap-2 mb-2">
							<section.Icon style={{ width: "1.4em", height: "1.4em" }} />
							<span className="font-medium">{section.title}</span>
						</div>
						<div className="pl-6 space-y-1">
							{section.items.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									onClick={toggleNavbar}
									className={cn(
										"block py-1.5 text-sm text-muted-foreground hover:text-foreground",
										pathname === item.href && "text-foreground font-medium",
									)}
								>
									{item.title}
								</Link>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
