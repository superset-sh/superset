"use client";

import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
	navigationMenuTriggerStyle,
} from "@superset/ui/navigation-menu";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import {
	type NavLink,
	PRODUCT_LINKS,
	RESOURCE_LINKS,
	TOP_LEVEL_LINKS,
} from "../../constants";

const triggerClass = cn(
	navigationMenuTriggerStyle(),
	"h-8 bg-transparent px-3 text-sm font-normal text-muted-foreground hover:bg-accent/40 hover:text-foreground focus:bg-accent/40 focus:text-foreground data-[state=open]:bg-accent/40 data-[state=open]:text-foreground",
);

export function DesktopNav() {
	return (
		<NavigationMenu>
			<NavigationMenuList>
				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Product
					</NavigationMenuTrigger>
					<NavigationMenuContent>
						<ul className="flex w-[320px] flex-col gap-1 p-2">
							{PRODUCT_LINKS.map((link) => (
								<NavListItem key={link.href} link={link} />
							))}
						</ul>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Resources
					</NavigationMenuTrigger>
					<NavigationMenuContent>
						<ul className="grid w-[400px] grid-cols-1 gap-1 p-2 sm:w-[460px] sm:grid-cols-2">
							{RESOURCE_LINKS.map((link) => (
								<NavListItem key={link.href} link={link} />
							))}
						</ul>
					</NavigationMenuContent>
				</NavigationMenuItem>

				{TOP_LEVEL_LINKS.map((link) => (
					<NavigationMenuItem key={link.href}>
						<NavigationMenuLink asChild className={triggerClass}>
							<Link href={link.href}>{link.label}</Link>
						</NavigationMenuLink>
					</NavigationMenuItem>
				))}
			</NavigationMenuList>
		</NavigationMenu>
	);
}

function NavListItem({ link }: { link: NavLink }) {
	const content = (
		<>
			<div className="flex items-center gap-2 text-sm font-medium text-foreground">
				{link.label}
			</div>
			{link.description && (
				<p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
					{link.description}
				</p>
			)}
		</>
	);

	return (
		<li>
			<NavigationMenuLink asChild className="gap-1 rounded-sm p-3">
				{link.external ? (
					<a href={link.href} target="_blank" rel="noopener noreferrer">
						{content}
					</a>
				) : (
					<Link href={link.href}>{content}</Link>
				)}
			</NavigationMenuLink>
		</li>
	);
}
