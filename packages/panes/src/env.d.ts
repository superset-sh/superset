// Ambient module declarations for asset side-effect imports.
// Needed for cross-workspace imports (e.g., from @superset/ui) under tsgo.
declare module "*.css";
declare module "*.scss";
declare module "*.svg" {
	const src: string;
	export default src;
}
