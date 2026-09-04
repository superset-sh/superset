"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
			title={i18n._(
				msg({
					message: "Navigation",
				}),
			)}
			description={i18n._(
				msg({
					message: "Wayfinding and disclosure",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Tabs",
					}),
				)}
				importPath="@superset/ui/tabs"
			>
				<Tabs defaultValue="terminal" className="w-full max-w-72">
					<TabsList className="w-full">
						<TabsTrigger value="terminal">
							<Trans>Terminal</Trans>
						</TabsTrigger>
						<TabsTrigger value="diff">
							<Trans>Diff</Trans>
						</TabsTrigger>
						<TabsTrigger value="notes">
							<Trans>Notes</Trans>
						</TabsTrigger>
					</TabsList>
					<TabsContent
						value="terminal"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans>Interactive agent terminal.</Trans>
					</TabsContent>
					<TabsContent
						value="diff"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans>Review pending changes.</Trans>
					</TabsContent>
					<TabsContent
						value="notes"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans>Session notes and context.</Trans>
					</TabsContent>
				</Tabs>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Breadcrumb",
					}),
				)}
				importPath="@superset/ui/breadcrumb"
			>
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">
								<Trans>Home</Trans>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbEllipsis />
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">
								<Trans>Workspaces</Trans>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>
								<Trans>component-showcase</Trans>
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Pagination",
					}),
				)}
				importPath="@superset/ui/pagination"
			>
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
				title={i18n._(
					msg({
						message: "Navigation Menu",
					}),
				)}
				importPath="@superset/ui/navigation-menu"
			>
				<NavigationMenu>
					<NavigationMenuList>
						<NavigationMenuItem>
							<NavigationMenuTrigger>
								<Trans>Product</Trans>
							</NavigationMenuTrigger>
							<NavigationMenuContent>
								<ul className="grid w-64 gap-1 p-2">
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">
												<Trans>Workspaces</Trans>
											</span>
											<span className="text-muted-foreground">
												<Trans>Parallel agent worktrees</Trans>
											</span>
										</NavigationMenuLink>
									</li>
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">
												<Trans>Tasks</Trans>
											</span>
											<span className="text-muted-foreground">
												<Trans>Queue work for agents</Trans>
											</span>
										</NavigationMenuLink>
									</li>
								</ul>
							</NavigationMenuContent>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink href="#navigation">
								<Trans>Docs</Trans>
							</NavigationMenuLink>
						</NavigationMenuItem>
					</NavigationMenuList>
				</NavigationMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Accordion",
					}),
				)}
				importPath="@superset/ui/accordion"
			>
				<Accordion type="single" collapsible className="w-full max-w-72">
					<AccordionItem value="worktrees">
						<AccordionTrigger>
							<Trans>What is a workspace?</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans>
								An isolated git worktree where an agent runs without touching
								your main checkout.
							</Trans>
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="agents">
						<AccordionTrigger>
							<Trans>Which agents are supported?</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans>Claude Code, Codex, Cursor, OpenCode, and more.</Trans>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Collapsible",
					}),
				)}
				importPath="@superset/ui/collapsible"
			>
				<Collapsible className="w-full max-w-72">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">
							<Trans>3 archived workspaces</Trans>
						</span>
						<CollapsibleTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={i18n._(
									msg({
										message: "Toggle",
									}),
								)}
							>
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
