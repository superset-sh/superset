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
import { SupersetLogo } from "../SupersetLogo";

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
						<div className="grid w-[560px] grid-cols-[0.9fr_1fr] gap-2 p-2">
							<FeatureCard />
							<ul className="flex flex-col gap-1">
								{PRODUCT_LINKS.map((link) => (
									<NavListItem key={link.href} link={link} />
								))}
							</ul>
						</div>
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

function FeatureCard() {
	return (
		<NavigationMenuLink asChild className="h-full p-0 hover:bg-transparent">
			<Link
				href="/"
				className="group flex h-full flex-col justify-between rounded-md border border-border bg-gradient-to-br from-accent/60 to-accent/10 p-5 no-underline outline-none transition-colors hover:border-foreground/20"
			>
				<div className="text-foreground">
					<SupersetLogo />
				</div>
				<div className="space-y-2">
					<p className="text-sm font-medium text-foreground">
						The terminal for coding agents
					</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						Run 10+ parallel coding agents on your machine and switch between
						tasks as they need your attention.
					</p>
				</div>
			</Link>
		</NavigationMenuLink>
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
