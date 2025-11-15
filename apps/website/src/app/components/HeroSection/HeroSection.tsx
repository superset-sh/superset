import { FadeUp } from "./components/FadeUp";
import { HeroCanvas } from "./components/HeroCanvas";
import { HeroParallax } from "./components/HeroParallax";

export function HeroSection() {
	return (
		<HeroParallax className="relative min-h-screen flex items-center justify-center overflow-hidden pointer-events-none">
			<div className="absolute inset-0 z-0">
				<HeroCanvas className="w-full h-full" />
				<div className="absolute inset-0 bg-linear-to-b from-black/0 via-black/30 to-black" />
			</div>

			<div className="relative z-10 px-4 sm:px-8 text-center text-white flex flex-col items-center justify-center gap-2 sm:gap-4 mt-[20rem] sm:mt-[30rem]">
				<FadeUp>
					<h1 className="text-[4rem] sm:text-[8rem] md:text-[10rem] lg:text-[14rem] font-bold leading-none -mt-8 sm:-mt-16">
						Superset
					</h1>
				</FadeUp>
				<FadeUp delay={0.2}>
					<h2 className="text-lg sm:text-xl md:text-2xl font-thin px-4">
						The last developer tool you'll ever need
					</h2>
				</FadeUp>
			</div>
		</HeroParallax>
	);
}
