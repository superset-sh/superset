"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Marquee from "react-fast-marquee";

const CLIENT_LOGOS = [
	{ name: "cadra", logo: "/logos/cadra.png", height: 38, text: "Cadra" },
	{ name: "onlook", logo: "/logos/onlook.svg", height: 38 },
	{ name: "ycombinator", logo: "/logos/yc.png", height: 44 },
	{ name: "scribe", logo: "/logos/scribe.svg", height: 38 },
	{ name: "adamcad", logo: "/logos/adam.svg", height: 32, marginTop: -5 },
	{ name: "amazon", logo: "/logos/amazon.png", height: 32, marginTop: 20 },
	{ name: "google", logo: "/logos/google.svg", height: 32, marginTop: 10 },
	{ name: "servicenow", logo: "/logos/servicenow.svg", height: 24 },
	{ name: "mastra", logo: "/logos/mastra.svg", height: 28, text: "Mastra" },
	{
		name: "trainloop",
		logo: "/logos/trainloop.jpeg",
		height: 38,
		borderRadius: 10,
		text: "Trainloop",
	},
] as {
	name: string;
	logo: string;
	height: number;
	marginTop?: number;
	borderRadius?: number;
	text?: string;
}[];

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
					<Marquee
						speed={30}
						gradient={true}
						gradientColor="hsl(var(--background))"
						gradientWidth={100}
						pauseOnHover={false}
					>
						<div className="flex gap-12 sm:gap-16 md:gap-24 items-center mr-12 sm:mr-16 md:mr-24 h-14">
							{CLIENT_LOGOS.map((client) => (
								<div
									key={client.name}
									className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap h-14 gap-2"
								>
									<Image
										src={client.logo}
										alt={client.name}
										width={160}
										height={client.height}
										className="object-contain w-auto"
										style={{
											height: client.height,
											borderRadius: client?.borderRadius ?? 0,
											marginTop: client?.marginTop ?? 0,
										}}
									/>
									{client.text && (
										<span className="ml-2 mt-1 font-medium text-foreground text-[1.3rem]">
											{client.text}
										</span>
									)}
								</div>
							))}
						</div>
					</Marquee>
				</motion.div>
			</div>
		</section>
	);
}
