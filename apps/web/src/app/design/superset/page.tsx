import { msg } from "@lingui/core/macro";
import type { Metadata } from "next";
import { i18n } from "@/lib/i18n-server";
import { DesignPageHeader } from "../components/DesignPageHeader";
import { ShowcaseNav, type ShowcaseNavItem } from "../components/ShowcaseNav";
import { AiAgentSection } from "./components/AiAgentSection";
import { AiChatSection } from "./components/AiChatSection";
import { AiContentSection } from "./components/AiContentSection";
import { AiStatusSection } from "./components/AiStatusSection";
import { SharedComponentsSection } from "./components/SharedComponentsSection";
import { SupersetSection } from "./components/SupersetSection";

export const metadata: Metadata = {
	title: "Design · Superset components",
	description:
		"Superset's custom components: originals, AI elements, shared app components",
};

const NAV_ITEMS: ShowcaseNavItem[] = [
	{
		id: "superset",
		index: "01",
		title: i18n._(
			msg({
				message: "Originals",
			}),
		),
	},
	{
		id: "ai-status",
		index: "02",
		title: i18n._(
			msg({
				message: "AI · Status",
			}),
		),
	},
	{
		id: "ai-chat",
		index: "03",
		title: i18n._(
			msg({
				message: "AI · Conversation",
			}),
		),
	},
	{
		id: "ai-agent",
		index: "04",
		title: i18n._(
			msg({
				message: "AI · Agent activity",
			}),
		),
	},
	{
		id: "ai-content",
		index: "05",
		title: i18n._(
			msg({
				message: "AI · Content",
			}),
		),
	},
	{
		id: "shared",
		index: "06",
		title: i18n._(
			msg({
				message: "Shared app components",
			}),
		),
	},
];

export default function DesignSupersetPage() {
	return (
		<div className="min-h-screen bg-background">
			<DesignPageHeader
				active="superset"
				title={i18n._(
					msg({
						message: "Superset Components",
					}),
				)}
				description={
					<>
						{i18n._(
							msg({
								message:
									"Everything we built on top of the primitives — Superset originals, the",
							}),
						)}{" "}
						<code className="font-mono text-foreground">ai-elements</code>{" "}
						{i18n._(
							msg({
								message:
									"suite for agent UIs, and shared app components. Click any import path to copy it.",
							}),
						)}
					</>
				}
			/>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[11rem_1fr]">
				<ShowcaseNav items={NAV_ITEMS} />
				<main className="min-w-0 space-y-16 pb-24">
					<SupersetSection />
					<AiStatusSection />
					<AiChatSection />
					<AiAgentSection />
					<AiContentSection />
					<SharedComponentsSection />
				</main>
			</div>
		</div>
	);
}
