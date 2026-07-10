import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { ContactForm } from "./components/ContactForm";

export const metadata: Metadata = {
	title: "Contact",
	description: `Get in touch with the ${COMPANY.NAME} team.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/contact`,
	},
};

export default function ContactPage() {
	return (
		<main className="relative min-h-screen">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Contact
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Talk to Superset
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						Questions, feedback, support, or anything else. Send a note and
						we&apos;ll route it to the right person.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			<div className="relative max-w-3xl mx-auto px-6 py-12 md:py-16">
				<ContactForm />
			</div>
		</main>
	);
}
