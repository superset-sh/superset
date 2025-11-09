import { motion } from "framer-motion";
import { CLIENT_LOGOS } from "./constants";

export function ClientLogosSection() {
	return (
		<section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 md:px-8 bg-black overflow-hidden">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<h2 className="text-xl sm:text-2xl font-normal text-center mb-4 sm:mb-8 text-white px-4">
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
							{[...Array(3)].map((_, setIndex) => (
								<div
									key={setIndex}
									className="flex gap-12 sm:gap-16 md:gap-24 items-center"
								>
									{CLIENT_LOGOS.map((client) => (
										<div
											key={`${setIndex}-${client.name}`}
											className="text-white text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap"
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
