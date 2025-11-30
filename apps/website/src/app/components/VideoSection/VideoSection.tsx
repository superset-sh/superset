import { motion } from "framer-motion";
import Image from "next/image";

export function VideoSection() {
	return (
		<section className="pt-8 sm:pt-12 md:pt-16 pb-16 sm:pb-24 md:pb-32 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
					className="w-full"
				>
					{/* Video placeholder */}
					<div className="relative w-full aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
						<Image
							src="/example.png"
							alt="Demo video"
							fill
							className="object-fit"
						/>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
