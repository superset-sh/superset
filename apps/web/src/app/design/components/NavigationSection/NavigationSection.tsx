"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@superset/ui/accordion";
import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@superset/ui/navigation-menu";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@superset/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { ChevronsUpDownIcon } from "lucide-react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function NavigationSection() {
	return (
		<ShowcaseSection
			id="navigation"
			index="06"
			title="Navigation"
			description="Wayfinding and disclosure"
		>
			<ComponentCard title="Tabs" importPath="@superset/ui/tabs">
				<Tabs defaultValue="terminal" className="w-full max-w-72">
					<TabsList className="w-full">
						<TabsTrigger value="terminal">Terminal</TabsTrigger>
						<TabsTrigger value="diff">Diff</TabsTrigger>
						<TabsTrigger value="notes">Notes</TabsTrigger>
					</TabsList>
					<TabsContent
						value="terminal"
						className="pt-2 text-sm text-muted-foreground"
					>
						Interactive agent terminal.
					</TabsContent>
					<TabsContent
						value="diff"
						className="pt-2 text-sm text-muted-foreground"
					>
						Review pending changes.
					</TabsContent>
					<TabsContent
						value="notes"
						className="pt-2 text-sm text-muted-foreground"
					>
						Session notes and context.
					</TabsContent>
				</Tabs>
			</ComponentCard>

			<ComponentCard title="Breadcrumb" importPath="@superset/ui/breadcrumb">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">Home</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbEllipsis />
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">Workspaces</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>component-showcase</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</ComponentCard>

			<ComponentCard title="Pagination" importPath="@superset/ui/pagination">
				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious href="#navigation" />
						</PaginationItem>
						<PaginationItem>
							<PaginationLink href="#navigation">1</PaginationLink>
						</PaginationItem>
						<PaginationItem>
							<PaginationLink href="#navigation" isActive>
								2
							</PaginationLink>
						</PaginationItem>
						<PaginationItem>
							<PaginationEllipsis />
						</PaginationItem>
						<PaginationItem>
							<PaginationNext href="#navigation" />
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</ComponentCard>

			<ComponentCard
				title="Navigation Menu"
				importPath="@superset/ui/navigation-menu"
			>
				<NavigationMenu>
					<NavigationMenuList>
						<NavigationMenuItem>
							<NavigationMenuTrigger>Product</NavigationMenuTrigger>
							<NavigationMenuContent>
								<ul className="grid w-64 gap-1 p-2">
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">Workspaces</span>
											<span className="text-muted-foreground">
												Parallel agent worktrees
											</span>
										</NavigationMenuLink>
									</li>
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">Tasks</span>
											<span className="text-muted-foreground">
												Queue work for agents
											</span>
										</NavigationMenuLink>
									</li>
								</ul>
							</NavigationMenuContent>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink href="#navigation">Docs</NavigationMenuLink>
						</NavigationMenuItem>
					</NavigationMenuList>
				</NavigationMenu>
			</ComponentCard>

			<ComponentCard title="Accordion" importPath="@superset/ui/accordion">
				<Accordion type="single" collapsible className="w-full max-w-72">
					<AccordionItem value="worktrees">
						<AccordionTrigger>What is a workspace?</AccordionTrigger>
						<AccordionContent>
							An isolated git worktree where an agent runs without touching your
							main checkout.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="agents">
						<AccordionTrigger>Which agents are supported?</AccordionTrigger>
						<AccordionContent>
							Claude Code, Codex, Cursor, OpenCode, and more.
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</ComponentCard>

			<ComponentCard title="Collapsible" importPath="@superset/ui/collapsible">
				<Collapsible className="w-full max-w-72">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">3 archived workspaces</span>
						<CollapsibleTrigger asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Toggle">
								<ChevronsUpDownIcon />
							</Button>
						</CollapsibleTrigger>
					</div>
					<CollapsibleContent className="mt-2 space-y-1">
						{["fix-auth-redirect", "bump-deps", "onboarding-copy"].map(
							(name) => (
								<div
									key={name}
									className="rounded-md border px-3 py-1.5 font-mono text-xs text-muted-foreground"
								>
									{name}
								</div>
							),
						)}
					</CollapsibleContent>
				</Collapsible>
			</ComponentCard>
		</ShowcaseSection>
	);
}
