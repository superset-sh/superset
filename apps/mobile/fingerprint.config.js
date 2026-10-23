// The home-screen name has no effect on JS and native compatibility. Keeping it
// out of the fingerprint lets a build that differs only in its name take the
// same updates as the builds already installed.
const BRAND_SOURCE = "../../packages/shared/src/brand.ts";

/** @param {string} expoConfigJson */
function withoutDisplayName(expoConfigJson) {
	const expoConfig = JSON.parse(expoConfigJson);
	if (expoConfig.ios?.infoPlist?.CFBundleDisplayName === undefined) {
		return expoConfigJson;
	}
	delete expoConfig.ios.infoPlist.CFBundleDisplayName;
	return JSON.stringify(expoConfig);
}

/** @type {import('expo/fingerprint').Config} */
module.exports = {
	sourceSkips: [
		"ExpoConfigVersions",
		"PackageJsonAndroidAndIosScriptsIfNotContainRun",
	],
	ignorePaths: [BRAND_SOURCE],
	fileHookTransform: (source, chunk) =>
		source.type === "contents" && source.id === "expoConfig"
			? withoutDisplayName(chunk)
			: chunk,
};
