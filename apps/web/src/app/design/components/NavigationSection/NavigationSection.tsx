"use client";

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
			title={i18n._({
				id: "web.design.navigationSection.navigation",
				message: "Navigation",
			})}
			description={i18n._({
				id: "web.design.navigationSection.wayfindingAndDisclosure",
				message: "Wayfinding and disclosure",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.navigationSection.tabs",
					message: "Tabs",
				})}
				importPath="@superset/ui/tabs"
			>
				<Tabs defaultValue="terminal" className="w-full max-w-72">
					<TabsList className="w-full">
						<TabsTrigger value="terminal">
							<Trans id="web.design.navigationSection.terminal">Terminal</Trans>
						</TabsTrigger>
						<TabsTrigger value="diff">
							<Trans id="web.design.navigationSection.diff">Diff</Trans>
						</TabsTrigger>
						<TabsTrigger value="notes">
							<Trans id="web.design.navigationSection.notes">Notes</Trans>
						</TabsTrigger>
					</TabsList>
					<TabsContent
						value="terminal"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans id="web.design.navigationSection.interactiveAgentTerminal">
							Interactive agent terminal.
						</Trans>
					</TabsContent>
					<TabsContent
						value="diff"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans id="web.design.navigationSection.reviewPendingChanges">
							Review pending changes.
						</Trans>
					</TabsContent>
					<TabsContent
						value="notes"
						className="pt-2 text-sm text-muted-foreground"
					>
						<Trans id="web.design.navigationSection.sessionNotesAndContext">
							Session notes and context.
						</Trans>
					</TabsContent>
				</Tabs>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.navigationSection.breadcrumb",
					message: "Breadcrumb",
				})}
				importPath="@superset/ui/breadcrumb"
			>
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">
								<Trans id="web.design.navigationSection.home">Home</Trans>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbEllipsis />
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink href="#navigation">
								<Trans id="web.design.navigationSection.workspaces">
									Workspaces
								</Trans>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>
								<Trans id="web.design.navigationSection.componentShowcase">
									component-showcase
								</Trans>
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.navigationSection.pagination",
					message: "Pagination",
				})}
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
				title={i18n._({
					id: "web.design.navigationSection.navigationMenu",
					message: "Navigation Menu",
				})}
				importPath="@superset/ui/navigation-menu"
			>
				<NavigationMenu>
					<NavigationMenuList>
						<NavigationMenuItem>
							<NavigationMenuTrigger>
								<Trans id="web.design.navigationSection.product">Product</Trans>
							</NavigationMenuTrigger>
							<NavigationMenuContent>
								<ul className="grid w-64 gap-1 p-2">
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">
												<Trans id="web.design.navigationSection.workspaces">
													Workspaces
												</Trans>
											</span>
											<span className="text-muted-foreground">
												<Trans id="web.design.navigationSection.parallelAgentWorktrees">
													Parallel agent worktrees
												</Trans>
											</span>
										</NavigationMenuLink>
									</li>
									<li>
										<NavigationMenuLink href="#navigation">
											<span className="font-medium">
												<Trans id="web.design.navigationSection.tasks">
													Tasks
												</Trans>
											</span>
											<span className="text-muted-foreground">
												<Trans id="web.design.navigationSection.queueWorkForAgents">
													Queue work for agents
												</Trans>
											</span>
										</NavigationMenuLink>
									</li>
								</ul>
							</NavigationMenuContent>
						</NavigationMenuItem>
						<NavigationMenuItem>
							<NavigationMenuLink href="#navigation">
								<Trans id="web.design.navigationSection.docs">Docs</Trans>
							</NavigationMenuLink>
						</NavigationMenuItem>
					</NavigationMenuList>
				</NavigationMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.navigationSection.accordion",
					message: "Accordion",
				})}
				importPath="@superset/ui/accordion"
			>
				<Accordion type="single" collapsible className="w-full max-w-72">
					<AccordionItem value="worktrees">
						<AccordionTrigger>
							<Trans id="web.design.navigationSection.whatIsAWorkspace">
								What is a workspace?
							</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans id="web.design.navigationSection.anIsolatedGitWorktreeWhere">
								An isolated git worktree where an agent runs without touching
								your main checkout.
							</Trans>
						</AccordionContent>
					</AccordionItem>
					<AccordionItem value="agents">
						<AccordionTrigger>
							<Trans id="web.design.navigationSection.whichAgentsAreSupported">
								Which agents are supported?
							</Trans>
						</AccordionTrigger>
						<AccordionContent>
							<Trans id="web.design.navigationSection.claudeCodeCodexCursorOpencode">
								Claude Code, Codex, Cursor, OpenCode, and more.
							</Trans>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.navigationSection.collapsible",
					message: "Collapsible",
				})}
				importPath="@superset/ui/collapsible"
			>
				<Collapsible className="w-full max-w-72">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">
							<Trans id="web.design.navigationSection.3ArchivedWorkspaces">
								3 archived workspaces
							</Trans>
						</span>
						<CollapsibleTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={i18n._({
									id: "web.design.navigationSection.toggle",
									message: "Toggle",
								})}
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
