/** @type {import('jest').Config} */
module.exports = {
	moduleFileExtensions: ["js", "json", "ts"],
	rootDir: ".",
	testRegex: ".*\\.spec\\.ts$",
	transform: {
		"^.+\\.(t|j)s$": "ts-jest",
	},
	collectCoverageFrom: [
		"**/*.(t|j)s",
		"!**/*.spec.ts",
		"!**/node_modules/**",
		"!**/__test-utils__/**",
	],
	coverageDirectory: "./coverage",
	coverageThreshold: {
		global: {
			statements: 80,
			branches: 70,
			functions: 80,
			lines: 80,
		},
	},
	testEnvironment: "node",
	moduleNameMapper: {
		"^@superbuilder/drizzle$": "<rootDir>/../drizzle/src/index.ts",
		"^@superset/agent$": "<rootDir>/../agent/src/index.ts",
		"^@/core/(.*)$": "<rootDir>/core/$1",
		"^@/shared/(.*)$": "<rootDir>/shared/$1",
		"^@/features/(.*)$": "<rootDir>/features/$1",
	},
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
