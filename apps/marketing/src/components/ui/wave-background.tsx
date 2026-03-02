"use client";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { createNoise2D } from "simplex-noise";

interface Point {
	x: number;
	y: number;
	wave: { x: number; y: number };
	cursor: {
		x: number;
		y: number;
		vx: number;
		vy: number;
	};
}

interface WavesProps {
	className?: string;
	strokeColor?: string;
	backgroundColor?: string;
	pointerSize?: number;
}

export function Waves({
	className = "",
	strokeColor = "#ffffff", // White lines
	backgroundColor = "#000000", // Black background
	pointerSize = 0.5,
}: WavesProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const mouseRef = useRef({
		x: -10,
		y: 0,
		lx: 0,
		ly: 0,
		sx: 0,
		sy: 0,
		v: 0,
		vs: 0,
		a: 0,
		set: false,
	});
	const pathsRef = useRef<SVGPathElement[]>([]);
	const linesRef = useRef<Point[][]>([]);
	const noiseRef = useRef<((x: number, y: number) => number) | null>(null);
	const rafRef = useRef<number | null>(null);
	const boundingRef = useRef<DOMRect | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Animation runs once on mount
	useEffect(() => {
		if (!containerRef.current || !svgRef.current) return;

		noiseRef.current = createNoise2D();

		setSize();
		setLines();

		window.addEventListener("resize", onResize);
		window.addEventListener("mousemove", onMouseMove);
		containerRef.current.addEventListener("touchmove", onTouchMove, {
			passive: false,
		});

		rafRef.current = requestAnimationFrame(tick);

		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("mousemove", onMouseMove);
			containerRef.current?.removeEventListener("touchmove", onTouchMove);
		};
	}, []);

	const setSize = () => {
		if (!containerRef.current || !svgRef.current) return;

		boundingRef.current = containerRef.current.getBoundingClientRect();
		const { width, height } = boundingRef.current;

		svgRef.current.style.width = `${width}px`;
		svgRef.current.style.height = `${height}px`;
	};

	const setLines = () => {
		if (!svgRef.current || !boundingRef.current) return;

		const { width, height } = boundingRef.current;
		linesRef.current = [];

		pathsRef.current.forEach((path) => {
			path.remove();
		});
		pathsRef.current = [];

		const xGap = 8;
		const yGap = 8;

		const oWidth = width + 200;
		const oHeight = height + 30;

		const totalLines = Math.ceil(oWidth / xGap);
		const totalPoints = Math.ceil(oHeight / yGap);

		const xStart = (width - xGap * totalLines) / 2;
		const yStart = (height - yGap * totalPoints) / 2;

		for (let i = 0; i < totalLines; i++) {
			const points: Point[] = [];

			for (let j = 0; j < totalPoints; j++) {
				const point: Point = {
					x: xStart + xGap * i,
					y: yStart + yGap * j,
					wave: { x: 0, y: 0 },
					cursor: { x: 0, y: 0, vx: 0, vy: 0 },
				};

				points.push(point);
			}

			const path = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"path",
			);
			path.classList.add("a__line");
			path.classList.add("js-line");
			path.setAttribute("fill", "none");
			path.setAttribute("stroke", strokeColor);
			path.setAttribute("stroke-width", "1");

			svgRef.current.appendChild(path);
			pathsRef.current.push(path);

			linesRef.current.push(points);
		}
	};

	const onResize = () => {
		setSize();
		setLines();
	};

	const onMouseMove = (e: MouseEvent) => {
		updateMousePosition(e.pageX, e.pageY);
	};

	const onTouchMove = (e: TouchEvent) => {
		e.preventDefault();
		const touch = e.touches[0];
		if (touch) {
			updateMousePosition(touch.clientX, touch.clientY);
		}
	};

	const updateMousePosition = (x: number, y: number) => {
		if (!boundingRef.current) return;

		const mouse = mouseRef.current;
		mouse.x = x - boundingRef.current.left;
		mouse.y = y - boundingRef.current.top + window.scrollY;

		if (!mouse.set) {
			mouse.sx = mouse.x;
			mouse.sy = mouse.y;
			mouse.lx = mouse.x;
			mouse.ly = mouse.y;

			mouse.set = true;
		}

		if (containerRef.current) {
			containerRef.current.style.setProperty("--x", `${mouse.sx}px`);
			containerRef.current.style.setProperty("--y", `${mouse.sy}px`);
		}
	};

	const movePoints = (time: number) => {
		const { current: lines } = linesRef;
		const { current: mouse } = mouseRef;
		const { current: noise } = noiseRef;

		if (!noise) return;

		lines.forEach((points) => {
			points.forEach((p: Point) => {
				const move =
					noise((p.x + time * 0.002) * 0.002, (p.y + time * 0.001) * 0.001) * 3;

				p.wave.x = Math.cos(move) * 3;
				p.wave.y = Math.sin(move) * 1.5;

				const dx = p.x - mouse.sx;
				const dy = p.y - mouse.sy;
				const d = Math.hypot(dx, dy);
				const l = 100;

				let targetX = 0;
				let targetY = 0;

				if (d < l && d > 0) {
					const s = (1 - d / l) * (1 - d / l);
					targetX = (dx / d) * s * 10;
					targetY = (dy / d) * s * 10;
				}

				p.cursor.x += (targetX - p.cursor.x) * 0.3;
				p.cursor.y += (targetY - p.cursor.y) * 0.3;
			});
		});
	};

	const moved = (point: Point, withCursorForce = true) => {
		const coords = {
			x: point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0),
			y: point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0),
		};

		return coords;
	};

	const drawLines = () => {
		const { current: lines } = linesRef;
		const { current: paths } = pathsRef;

		lines.forEach((points, lIndex) => {
			const path = paths[lIndex];
			const first = points[0];
			if (points.length < 2 || !path || !first) return;

			const firstPoint = moved(first, false);
			let d = `M ${firstPoint.x} ${firstPoint.y}`;

			for (let i = 1; i < points.length; i++) {
				const point = points[i];
				if (!point) continue;
				const current = moved(point);
				d += `L ${current.x} ${current.y}`;
			}

			path.setAttribute("d", d);
		});
	};

	const tick = (time: number) => {
		const { current: mouse } = mouseRef;

		mouse.sx += (mouse.x - mouse.sx) * 0.1;
		mouse.sy += (mouse.y - mouse.sy) * 0.1;

		const dx = mouse.x - mouse.lx;
		const dy = mouse.y - mouse.ly;
		const d = Math.hypot(dx, dy);

		mouse.v = d;
		mouse.vs += (d - mouse.vs) * 0.1;
		mouse.vs = Math.min(100, mouse.vs);

		mouse.lx = mouse.x;
		mouse.ly = mouse.y;

		mouse.a = Math.atan2(dy, dx);

		if (containerRef.current) {
			containerRef.current.style.setProperty("--x", `${mouse.sx}px`);
			containerRef.current.style.setProperty("--y", `${mouse.sy}px`);
		}

		movePoints(time);
		drawLines();

		rafRef.current = requestAnimationFrame(tick);
	};

	return (
		<div
			ref={containerRef}
			className={`waves-component relative overflow-hidden ${className}`}
			style={
				{
					backgroundColor,
					position: "absolute",
					top: 0,
					left: 0,
					margin: 0,
					padding: 0,
					width: "100%",
					height: "100%",
					overflow: "hidden",
					"--x": "-0.5rem",
					"--y": "50%",
				} as React.CSSProperties
			}
		>
			<svg
				ref={svgRef}
				className="block w-full h-full js-svg"
				xmlns="http://www.w3.org/2000/svg"
			/>
			<div
				className="pointer-dot"
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: `${pointerSize}rem`,
					height: `${pointerSize}rem`,
					background: strokeColor,
					borderRadius: "50%",
					transform:
						"translate3d(calc(var(--x) - 50%), calc(var(--y) - 50%), 0)",
					willChange: "transform",
				}}
			/>
		</div>
	);
}
