import type { Metadata } from "next";

import { DesignPageHeader } from "../components/DesignPageHeader";
import { ShowcaseNav, type ShowcaseNavItem } from "../components/ShowcaseNav";
import { BadgeAuditSection } from "./components/BadgeAuditSection";
import { ButtonAuditSection } from "./components/ButtonAuditSection";
import { InputAuditSection } from "./components/InputAuditSection";
import { SidebarAuditSection } from "./components/SidebarAuditSection";

export const metadata: Metadata = {
	title: "Design · Audit",
	description:
		"Real-world variance of standard components, for deciding the canonical set",
};

const NAV_ITEMS: ShowcaseNavItem[] = [
	{ id: "button-audit", index: "01", title: "Button" },
	{ id: "badge-audit", index: "02", title: "Badge" },
	{ id: "input-audit", index: "03", title: "Input" },
	{ id: "sidebar-audit", index: "04", title: "Sidebar" },
];

export default function DesignAuditPage() {
	return (
		<div className="min-h-screen bg-background">
			<DesignPageHeader
				active="audit"
				title="Audit: standard components in the wild"
				description={
					<>
						A temporary decision tool, not a reference — every card below is the
						real JSX from a real call site, grouped by visual treatment. The
						primitives are clean; usage isn't. Reply with which treatments
						should survive as canonical, which should migrate to an existing
						variant, and which deserve a new one.
					</>
				}
			/>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[11rem_1fr]">
				<ShowcaseNav items={NAV_ITEMS} />
				<main className="min-w-0 space-y-16 pb-24">
					<ButtonAuditSection />
					<BadgeAuditSection />
					<InputAuditSection />
					<SidebarAuditSection />
				</main>
			</div>
		</div>
	);
}
