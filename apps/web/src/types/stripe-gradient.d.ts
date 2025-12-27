declare module "stripe-gradient" {
	export class Gradient {
		initGradient(selector: string): void;
		disconnect(): void;
		pause(): void;
		el: HTMLElement | null;
		conf: { playing?: boolean };
		uniforms: {
			u_global?: {
				value?: {
					noiseSpeed?: {
						value: number;
					};
				};
			};
		};
	}
}
