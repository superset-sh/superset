/// <reference types="bun" />

// Ambient module declarations for asset side-effect imports.
// tsc accepted these without declarations; tsgo (TS 7) requires them.
declare module "*.css";
declare module "*.scss";
declare module "*.svg" {
	const src: string;
	export default src;
}
