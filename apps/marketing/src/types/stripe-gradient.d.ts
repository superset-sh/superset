declare module "stripe-gradient" {
	export class Gradient {
		constructor();
		initGradient(selector: string): void;
		play(): void;
		pause(): void;
		disconnect(): void;
	}

	export class MiniGl {
		constructor(
			canvas: HTMLCanvasElement,
			width?: number,
			height?: number,
			debug?: boolean,
		);
	}
}
