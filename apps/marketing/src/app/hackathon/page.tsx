import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { RaffleForm } from "./components/RaffleForm";

export const metadata: Metadata = {
	title: "Hackathon",
	description:
		"Enter the Superset hackathon raffle for a chance to win. Download Superset and get started.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/hackathon`,
	},
};

export default function HackathonPage() {
	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<div className="max-w-lg mx-auto px-6 sm:px-8">
				<header className="text-center mb-12">
					<h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground">
						Hackathon
					</h1>
					<p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
						Enter your name and email to join the raffle, then download{" "}
						<span className="font-semibold italic">Superset</span> to get
						started.
					</p>
				</header>

				<RaffleForm />
			</div>
		</main>
	);
}
