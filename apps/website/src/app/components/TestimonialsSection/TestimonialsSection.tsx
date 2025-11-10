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
	{
		quote:
			"Creative geniuses who listen, understand, and craft captivating visuals - an agency that truly understands our needs.",
		author: "Gabrielle Williams",
		title: "CEO and Co-founder of ABC Company",
		avatar: "GW",
		color: "bg-yellow-400",
	},
	{
		quote:
			"A refreshing and imaginative agency that consistently delivers exceptional results - highly recommended for any project.",
		author: "Victoria Thompson",
		title: "CEO and Co-founder of ABC Company",
		avatar: "VT",
		color: "bg-purple-400",
	},
	{
		quote:
			"Their team's artistic flair and strategic approach resulted in remarkable campaigns - a reliable creative partner.",
		author: "John Peter",
		title: "CEO and Co-founder of ABC Company",
		avatar: "JP",
		color: "bg-amber-600",
	},
	{
		quote:
			"From concept to execution, their creativity knows no bounds - a game-changer for our brand's success.",
		author: "Natalie Martinez",
		title: "CEO and Co-founder of ABC Company",
		avatar: "NM",
		color: "bg-indigo-400",
	},
] as const;

export function TestimonialsSection() {
	return (
		<section className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12 sm:mb-16"
				>
					<h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
						What Our Clients Say
					</h2>
					<p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto">
						Trusted by industry leaders to deliver exceptional results
					</p>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
					{TESTIMONIALS.map((testimonial, idx) => (
						<motion.div
							key={testimonial.author}
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true, margin: "-100px" }}
							transition={{ duration: 0.5, delay: idx * 0.1 }}
							className="bg-zinc-900/50 rounded-2xl p-6 sm:p-8 border border-zinc-800 hover:border-zinc-700 transition-colors"
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
						</motion.div>
					))}
				</div>
			</div>
		</section>
	);
}
