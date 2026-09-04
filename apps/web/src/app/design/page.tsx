import { msg } from "@lingui/core/macro";
import type { Metadata } from "next";
import { i18n } from "@/lib/i18n-server";
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
	{
		id: "actions",
		index: "01",
		title: i18n._(msg({ message: "Actions" })),
	},
	{
		id: "inputs",
		index: "02",
		title: i18n._(msg({ message: "Inputs" })),
	},
	{
		id: "overlays",
		index: "03",
		title: i18n._(msg({ message: "Overlays" })),
	},
	{
		id: "menus",
		index: "04",
		title: i18n._(msg({ message: "Menus" })),
	},
	{
		id: "feedback",
		index: "05",
		title: i18n._(msg({ message: "Feedback" })),
	},
	{
		id: "navigation",
		index: "06",
		title: i18n._(msg({ message: "Navigation" })),
	},
	{
		id: "data",
		index: "07",
		title: i18n._(msg({ message: "Data display" })),
	},
	{
		id: "layout",
		index: "08",
		title: i18n._(msg({ message: "Layout" })),
	},
];

export default function DesignPage() {
	return (
		<div className="min-h-screen bg-background">
			<DesignPageHeader
				active="primitives"
				title={i18n._(
					msg({
						message: "Superset Design System",
					}),
				)}
				description={
					<>
						{i18n._(
							msg({
								message: "A living reference of every component exported from",
							}),
						)}{" "}
						<code className="font-mono text-foreground">@superset/ui</code>
						{i18n._(
							msg({
								message:
									". Each card shows the canonical import path — click it to copy. Reach for these before writing anything custom.",
							}),
						)}
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
