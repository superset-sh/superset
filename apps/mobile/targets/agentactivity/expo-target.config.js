/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
	type: "widget",
	name: "AgentActivity",
	displayName: "Agent Activity",
	deploymentTarget: "26.0",
	frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],
	images: {
		"superset-mark": {
			"1x": "./superset-mark.png",
			"2x": "./superset-mark@2x.png",
			"3x": "./superset-mark@3x.png",
		},
	},
	entitlements: {
		"com.apple.security.application-groups":
			config.ios.entitlements["com.apple.security.application-groups"],
	},
});
