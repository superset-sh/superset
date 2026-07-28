import type { Metadata } from "next";

import { ActionsSection } from "./components/ActionsSection";
import { DataSection } from "./components/DataSection";
import { DesignPageHeader } from "./components/DesignPageHeader";
import { FeedbackSection } from "./components/FeedbackSection";
import { InputsSection } from "./components/InputsSection";
import { LayoutSection } from "./components/LayoutSection";
import { MenusSection } from "./components/MenusSection";
import { NavigationSection } from "./components/NavigationSection";
import { OverlaysSection } from "./components/OverlaysSection";
import { ShowcaseNav, type ShowcaseNavItem } from "./components/ShowcaseNav";

export const metadata: Metadata = {
	title: "Design · Superset",
	description: "Living reference for every @superset/ui component",
};

const NAV_ITEMS: ShowcaseNavItem[] = [
	{ id: "actions", index: "01", title: "Actions" },
	{ id: "inputs", index: "02", title: "Inputs" },
	{ id: "overlays", index: "03", title: "Overlays" },
	{ id: "menus", index: "04", title: "Menus" },
	{ id: "feedback", index: "05", title: "Feedback" },
	{ id: "navigation", index: "06", title: "Navigation" },
	{ id: "data", index: "07", title: "Data display" },
	{ id: "layout", index: "08", title: "Layout" },
];

export default function DesignPage() {
	return (
		<div className="min-h-screen bg-background">
			<DesignPageHeader
				active="primitives"
				title="Superset Design System"
				description={
					<>
						A living reference of every component exported from{" "}
						<code className="font-mono text-foreground">@superset/ui</code>.
						Each card shows the canonical import path — click it to copy. Reach
						for these before writing anything custom.
					</>
				}
			/>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[11rem_1fr]">
				<ShowcaseNav items={NAV_ITEMS} />
				<main className="min-w-0 space-y-16 pb-24">
					<ActionsSection />
					<InputsSection />
					<OverlaysSection />
					<MenusSection />
					<FeedbackSection />
					<NavigationSection />
					<DataSection />
					<LayoutSection />
				</main>
			</div>
		</div>
	);
}
