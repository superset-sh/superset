import type { Root } from "fumadocs-core/page-tree";
import { SidebarProvider } from "fumadocs-ui/components/sidebar/base";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import CustomSidebar from "../sidebar";
import { NavProvider } from "./nav";

export interface CustomDocsLayoutProps {
	tree: Root;
	children: ReactNode;
	containerProps?: HTMLAttributes<HTMLDivElement>;
}

export function CustomDocsLayout({
	children,
	tree,
	containerProps,
}: CustomDocsLayoutProps): ReactNode {
	const variables = cn(
		"[--fd-tocnav-height:36px] md:[--fd-sidebar-width:268px] lg:[--fd-sidebar-width:286px] xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
	);

	return (
		<TreeContextProvider tree={tree}>
			<SidebarProvider>
				<NavProvider>
					<main
						id="nd-docs-layout"
						{...containerProps}
						className={cn(
							"flex flex-1 flex-row pe-(--fd-layout-offset)",
							variables,
							containerProps?.className,
						)}
						style={
							{
								"--fd-layout-offset":
									"max(calc(50vw - var(--fd-layout-width) / 2), 0px)",
								...containerProps?.style,
							} as object
						}
					>
						<div
							className={cn(
								"[--fd-tocnav-height:36px] navbar:mr-[268px] lg:mr-[286px]! xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
							)}
						>
							<CustomSidebar />
						</div>
						{children}
					</main>
				</NavProvider>
			</SidebarProvider>
		</TreeContextProvider>
	);
}
