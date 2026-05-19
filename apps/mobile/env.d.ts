// Ambient module declarations for asset side-effect imports.
// tsgo (TS 7) requires these; tsc 5.x accepted them implicitly.
declare module "*.css";
declare module "*.scss";
declare module "*.svg" {
	const src: string;
	export default src;
}
