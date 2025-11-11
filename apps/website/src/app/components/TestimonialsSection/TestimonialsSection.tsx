import { motion } from "framer-motion";

const TESTIMONIALS = [
	{
		quote: "I can switch from Warp to Superset for terminal management",
		author: "CTO of 21st.dev",
		title: "Chief Technology Officer",
		avatar: "21",
		color: "bg-blue-400",
	},
	{
		quote: "Superset upgrades in my trick or treat bag",
		author: "Founder of numbies.xyz",
		title: "Founder",
		avatar: "NB",
		color: "bg-orange-400",
	},
] as const;

export function TestimonialsSection() {
	// Split testimonials into two rows
	const firstRow = TESTIMONIALS.slice(0, 3);
	const secondRow = TESTIMONIALS.slice(3, 6);

	return (
		<section className="hidden py-16 sm:py-24 md:py-32 bg-black overflow-hidden">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12 sm:mb-16"
				>

					<h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
						Engineers love Superset
					</h2>
				</motion.div>
			</div>

			{/* First Row - Scroll Right to Left */}
			<div className="mb-6 overflow-hidden">
				<motion.div
					animate={{ x: [0, -1000] }}
					transition={{
						x: {
							repeat: Number.POSITIVE_INFINITY,
							repeatType: "loop",
							duration: 20,
							ease: "linear",
						},
					}}
					className="flex gap-6"
				>
					{[...firstRow, ...firstRow].map((testimonial, idx) => (
						<div
							key={`row1-${testimonial.author}-${idx}`}
							className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8 min-w-[350px] sm:min-w-[400px] flex-shrink-0"
						>
							<div className="flex items-start mb-6">
								<svg
									className="w-10 h-10 text-blue-500 flex-shrink-0"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Quote icon</title>
									<path d="M13 14.725c0-5.141 3.892-10.519 10-11.725l.984 2.126c-2.215.835-4.163 3.742-4.38 5.746 2.491.392 4.396 2.547 4.396 5.149 0 3.182-2.584 4.979-5.199 4.979-3.015 0-5.801-2.305-5.801-6.275zm-13 0c0-5.141 3.892-10.519 10-11.725l.984 2.126c-2.215.835-4.163 3.742-4.38 5.746 2.491.392 4.396 2.547 4.396 5.149 0 3.182-2.584 4.979-5.199 4.979-3.015 0-5.801-2.305-5.801-6.275z" />
								</svg>
							</div>

							<p className="text-zinc-300 mb-8 text-base sm:text-lg leading-relaxed">
								{testimonial.quote}
							</p>

							<div className="flex items-center gap-4">
								<div
									className={`${testimonial.color} w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
								>
									{testimonial.avatar}
								</div>
								<div>
									<div className="text-white font-semibold text-base">
										{testimonial.author}
									</div>
									<div className="text-zinc-500 text-sm">{testimonial.title}</div>
								</div>
							</div>
						</div>
					))}
				</motion.div>
			</div>

			{/* Second Row - Scroll Left to Right */}
			<div className="overflow-hidden">
				<motion.div
					animate={{ x: [-1000, 0] }}
					transition={{
						x: {
							repeat: Number.POSITIVE_INFINITY,
							repeatType: "loop",
							duration: 20,
							ease: "linear",
						},
					}}
					className="flex gap-6"
				>
					{[...secondRow, ...secondRow].map((testimonial, idx) => (
						<div
							key={`row2-${testimonial.author}-${idx}`}
							className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8 min-w-[350px] sm:min-w-[400px] flex-shrink-0"
						>
							<div className="flex items-start mb-6">
								<svg
									className="w-10 h-10 text-blue-500 flex-shrink-0"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Quote icon</title>
									<path d="M13 14.725c0-5.141 3.892-10.519 10-11.725l.984 2.126c-2.215.835-4.163 3.742-4.38 5.746 2.491.392 4.396 2.547 4.396 5.149 0 3.182-2.584 4.979-5.199 4.979-3.015 0-5.801-2.305-5.801-6.275zm-13 0c0-5.141 3.892-10.519 10-11.725l.984 2.126c-2.215.835-4.163 3.742-4.38 5.746 2.491.392 4.396 2.547 4.396 5.149 0 3.182-2.584 4.979-5.199 4.979-3.015 0-5.801-2.305-5.801-6.275z" />
								</svg>
							</div>

							<p className="text-zinc-300 mb-8 text-base sm:text-lg leading-relaxed">
								{testimonial.quote}
							</p>

							<div className="flex items-center gap-4">
								<div
									className={`${testimonial.color} w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
								>
									{testimonial.avatar}
								</div>
								<div>
									<div className="text-white font-semibold text-base">
										{testimonial.author}
									</div>
									<div className="text-zinc-500 text-sm">{testimonial.title}</div>
								</div>
							</div>
						</div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
