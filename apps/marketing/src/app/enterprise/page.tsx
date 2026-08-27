import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { Soc2Badge } from "@/app/components/Soc2Badge";
import { EnterpriseContactForm } from "./components/EnterpriseContactForm";
import { EnterpriseFAQ } from "./components/EnterpriseFAQ";

export const metadata: Metadata = {
	title: "Enterprise",
	description: `Bring ${COMPANY.NAME} to your team. Get in touch to learn more about enterprise plans and deployment options.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/enterprise`,
	},
};

export default function EnterprisePage() {
	return (
		<main className="relative min-h-screen">
			{/* Vertical guide lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Header section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<div className="flex items-start justify-between gap-8">
						<div>
							<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
								Enterprise
							</span>
							<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
								Superset for your team
							</h1>
							<p className="text-muted-foreground mt-3 max-w-lg">
								Interested in bringing Superset to your organization? Reach out
								and we&apos;ll work with you to find the right setup for your
								team.
							</p>
						</div>
						<a
							href={COMPANY.TRUST_URL}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="SOC 2 Type II compliant. Request our report."
							className="hidden md:block shrink-0 text-muted-foreground transition-colors hover:text-foreground"
						>
							<Soc2Badge size={104} />
						</a>
					</div>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Contact form */}
			<div className="relative max-w-3xl mx-auto px-6 py-12 md:py-16">
				<EnterpriseContactForm />
			</div>

			{/* FAQ */}
			<div className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<EnterpriseFAQ />
				</div>
			</div>
		</main>
	);
}
