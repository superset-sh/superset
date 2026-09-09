/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
	type: "widget",
	name: "AgentActivity",
	displayName: "Agent Activity",
	deploymentTarget: "26.0",
	frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],
	entitlements: {
		"com.apple.security.application-groups":
			config.ios.entitlements["com.apple.security.application-groups"],
	},
});
