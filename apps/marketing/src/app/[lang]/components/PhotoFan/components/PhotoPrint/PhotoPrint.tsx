import { type MotionProps, m } from "framer-motion";
import { Caveat } from "next/font/google";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { About } from "@/lib/about";

const handwriting = Caveat({
	subsets: ["latin"],
	weight: ["500"],
	display: "swap",
});

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.32 0 0 0 0 0.26 0 0 0 0 0.16 0 0 0 0.34 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>")`;

interface Wear {
	padding: string;
	edge: string;
	tintAngle: number;
	stain: string;
}

const WEARS: readonly Wear[] = [
	{
		padding: "4.4% 4.8% 0 4.2%",
		edge: "polygon(0.6% 1.2%, 99.1% 0%, 100% 99.2%, 0% 100%)",
		tintAngle: 160,
		stain:
			"radial-gradient(circle at 90% 8%, rgba(120,90,40,0.18), transparent 22%)",
	},
	{
		padding: "5% 4.2% 0 4.6%",
		edge: "polygon(0% 0.4%, 99.6% 1.1%, 99.3% 100%, 0.9% 99.2%)",
		tintAngle: 200,
		stain:
			"radial-gradient(circle at 8% 92%, rgba(120,90,40,0.2), transparent 20%)",
	},
	{
		padding: "4.2% 4.6% 0 5%",
		edge: "polygon(1.1% 0%, 100% 0.7%, 99% 99.5%, 0% 98.9%)",
		tintAngle: 120,
		stain:
			"radial-gradient(circle at 95% 88%, rgba(120,90,40,0.16), transparent 24%)",
	},
	{
		padding: "4.7% 4.4% 0 4.4%",
		edge: "polygon(0% 0%, 99.2% 0.8%, 100% 100%, 0.7% 99.4%)",
		tintAngle: 240,
		stain:
			"radial-gradient(circle at 5% 6%, rgba(120,90,40,0.2), transparent 18%)",
	},
	{
		padding: "4.6% 5% 0 4.8%",
		edge: "polygon(0.4% 0.8%, 100% 0%, 99.5% 99%, 0.3% 100%)",
		tintAngle: 90,
		stain:
			"radial-gradient(circle at 50% 96%, rgba(120,90,40,0.15), transparent 26%)",
	},
];

interface PhotoPrintProps {
	photo: About["photos"][number];
	wear: number;
	variant: "card" | "full";
	sizes: string;
	priority?: boolean;
	captionClassName?: string;
	photoMotion?: Pick<MotionProps, "initial" | "animate" | "transition">;
}

export function PhotoPrint({
	photo,
	wear,
	variant,
	sizes,
	priority,
	captionClassName = "",
	photoMotion,
}: PhotoPrintProps) {
	const look = WEARS[wear % WEARS.length] ?? WEARS[0];
	if (!look) return null;

	const paperStyle: CSSProperties = {
		padding: variant === "card" ? look.padding : "4.5% 4.5% 0 4.5%",
		clipPath: look.edge,
		backgroundImage: `${look.stain}, ${GRAIN}, linear-gradient(${look.tintAngle}deg, #f1e9d5, #e0d2b2)`,
		boxShadow: "inset 0 0 14px rgba(110,80,35,0.28)",
	};

	return (
		<div className="[filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.4))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]">
			<figure className="m-0" style={paperStyle}>
				<m.div
					{...photoMotion}
					className="relative overflow-hidden bg-neutral-800"
					style={
						photoMotion
							? undefined
							: { aspectRatio: variant === "card" ? "4 / 5" : "3 / 2" }
					}
				>
					<Image
						src={photo.src}
						alt={photo.alt}
						fill
						priority={priority}
						className="object-cover"
						style={{ objectPosition: photo.focus ?? "50% 50%" }}
						sizes={sizes}
					/>
				</m.div>
				<figcaption
					className={`${handwriting.className} text-[#3b3226] leading-tight ${
						variant === "card"
							? "px-[2%] pt-[5%] pb-[6%] text-[17px] min-h-[2.6rem] truncate"
							: "px-[1%] pt-[2.5%] pb-[3%] text-xl line-clamp-3 md:pb-0 md:h-[6.5rem] md:line-clamp-2 md:text-3xl"
					} ${captionClassName}`}
				>
					{variant === "card" ? photo.label : photo.caption}
				</figcaption>
			</figure>
		</div>
	);
}
