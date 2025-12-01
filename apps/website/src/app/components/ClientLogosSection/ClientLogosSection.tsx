import { motion } from "framer-motion";
import Marquee from "react-fast-marquee";
import { CLIENT_LOGOS } from "./constants";

export function ClientLogosSection() {
	return (
		<section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 md:px-8 overflow-hidden">
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
					<Marquee
						speed={30}
						gradient={true}
						gradientColor="var(--color-neutral-900)"
						gradientWidth={100}
						pauseOnHover={false}
					>
						<div className="flex gap-12 sm:gap-16 md:gap-24 items-center mr-12 sm:mr-16 md:mr-24">
							{CLIENT_LOGOS.map((client) => (
								<div
									key={client.name}
									className="text-white text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap"
								>
									{client.logo}
								</div>
							))}
						</div>
					</Marquee>
				</motion.div>
			</div>
		</section>
	);
}
