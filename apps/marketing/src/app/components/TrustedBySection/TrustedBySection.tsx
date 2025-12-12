"use client";

import { motion } from "framer-motion";

const CLIENT_LOGOS = [
	{ name: "numbies", logo: "numbies.xyz" },
	{ name: "cadra", logo: "Cadra" },
	{ name: "onlook", logo: "Onlook" },
	{ name: "amazon", logo: "Amazon" },
	{ name: "google", logo: "Google" },
	{ name: "servicenow", logo: "ServiceNow" },
	{ name: "ycombinator", logo: "Y Combinator" },
	{ name: "scribe", logo: "Scribe" },
] as const;

const LOGO_SETS = ["set-a", "set-b", "set-c"] as const;

export function TrustedBySection() {
	return (
		<section className="py-6 sm:py-12 md:py-18 px-4 sm:px-6 md:px-8 bg-background overflow-hidden">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<h2 className="text-lg sm:text-xl font-mono font-normal text-center mb-4 sm:mb-8 text-foreground px-4">
						Trusted by engineers from
					</h2>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, delay: 0.2 }}
					className="relative"
				>
					<div className="flex overflow-hidden">
						<motion.div
							className="flex gap-12 sm:gap-16 md:gap-24"
							animate={{
								x: [0, -1000],
							}}
							transition={{
								x: {
									repeat: Number.POSITIVE_INFINITY,
									repeatType: "loop",
									duration: 20,
									ease: "linear",
								},
							}}
						>
							{/* Render logos three times for seamless loop */}
							{LOGO_SETS.map((setId) => (
								<div
									key={setId}
									className="flex gap-12 sm:gap-16 md:gap-24 items-center"
								>
									{CLIENT_LOGOS.map((client) => (
										<div
											key={`${setId}-${client.name}`}
											className="text-foreground text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap"
										>
											{client.logo}
										</div>
									))}
								</div>
							))}
						</motion.div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
