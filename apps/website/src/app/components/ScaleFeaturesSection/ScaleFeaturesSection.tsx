import { motion } from "framer-motion";
import { ScaleFeatureCard } from "./components/ScaleFeatureCard";
import { SCALE_FEATURES } from "./constants";

export function ScaleFeaturesSection() {
	return (
		<section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-8 sm:mb-12 md:mb-16 text-white">
						Build like a
						<br />
						VP of Engineering
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
					{/* Analytics Card */}
					<ScaleFeatureCard feature={SCALE_FEATURES[0]} delay={0.1}>
						<div className="mt-4 sm:mt-8 p-4 sm:p-6 bg-zinc-900 rounded-2xl border border-zinc-800">
							<div className="mb-4">
								<h4 className="text-white font-semibold mb-2 text-sm sm:text-base">
									Overview
								</h4>
								<div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 lg:gap-8">
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Live Visitors
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											414
										</div>
									</div>
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Unique Visitors
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											1.7M
										</div>
									</div>
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Total Pageviews
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											3.2M
										</div>
									</div>
								</div>
							</div>
							<div className="h-24 sm:h-32 bg-gradient-to-t from-blue-500/10 to-transparent rounded-lg" />
						</div>
					</ScaleFeatureCard>

					{/* A/B Testing Card */}
					<ScaleFeatureCard feature={SCALE_FEATURES[1]} delay={0.2}>
						<div className="mt-4 sm:mt-8 relative">
							<div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-blue-500/20 rounded-full blur-3xl" />
							<div className="relative p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
								<div className="text-xs text-zinc-400 mb-2">
									Version Control
								</div>
								<div className="space-y-2">
									<div className="p-2 bg-zinc-800 rounded text-white text-sm">
										Version A
									</div>
									<div className="p-2 bg-blue-500/20 border border-blue-500/50 rounded text-white text-sm">
										Version B ✓
									</div>
								</div>
							</div>
						</div>
					</ScaleFeatureCard>

					{/* SEO Card */}
					<ScaleFeatureCard
						feature={SCALE_FEATURES[2]}
						delay={0.3}
						shadowColor="green"
						className="md:col-span-2"
					>
						<div className="flex-1 flex items-center justify-center mt-4 sm:mt-8">
							<div className="p-4 sm:p-6 bg-zinc-900 rounded-2xl border border-zinc-800 w-full">
								<div className="text-center mb-4">
									<div className="text-xs sm:text-sm text-zinc-400 mb-2">
										Google Lighthouse
									</div>
									<div className="flex justify-center gap-4 sm:gap-6 md:gap-8">
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-green-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												99
											</div>
											<div className="text-xs text-zinc-400">SEO</div>
										</div>
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-green-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												100
											</div>
											<div className="text-xs text-zinc-400">Performance</div>
										</div>
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-blue-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												98
											</div>
											<div className="text-xs text-zinc-400">Accessibility</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</ScaleFeatureCard>
				</div>
			</div>
		</section>
	);
}
