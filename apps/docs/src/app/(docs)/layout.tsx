import { SidebarProvider } from "fumadocs-ui/components/sidebar/base";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { cn } from "@/lib/cn";
import { source } from "@/lib/source";
import { NavProvider } from "./components/Navigation";
import { Sidebar } from "./components/Sidebar";

export default function Layout({ children }: LayoutProps<"/">) {
	const tree = source.getPageTree();
	const variables = cn(
		"[--fd-tocnav-height:36px] md:[--fd-sidebar-width:268px] lg:[--fd-sidebar-width:286px] xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
	);

	return (
		<TreeContextProvider tree={tree}>
			<SidebarProvider>
				<NavProvider>
					<main
						id="nd-docs-layout"
						className={cn(
							"flex flex-1 flex-row pe-(--fd-layout-offset)",
							variables,
						)}
						style={
							{
								"--fd-layout-offset":
									"max(calc(50vw - var(--fd-layout-width) / 2), 0px)",
							} as object
						}
					>
						<div
							className={cn(
								"[--fd-tocnav-height:36px] navbar:mr-[268px] lg:mr-[286px]! xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
							)}
						>
							<Sidebar />
						</div>
						{children}
					</main>
				</NavProvider>
			</SidebarProvider>
		</TreeContextProvider>
	);
}
