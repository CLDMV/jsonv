/**
 *	@Project: @cldmv/jsonv
 *	@Filename: /.configs/vitest.config.mjs
 *	@Date: 2026-01-14
 *	@Author: Nate Hyson <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Hyson <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-01-14
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	pool: "forks",
	resolve: {
		conditions: [
			"json-dev", // Custom condition for development
			"module",
			"browser",
			"development|production"
		]
	},
	ssr: {
		resolve: {
			conditions: ["json-dev", "node", "development|production"]
		}
	},
	test: {
		// CLDMV standing convention: vitest test files are always named `*.test.vitest.mjs`.
		include: ["tests/**/*.test.vitest.mjs"],
		exclude: ["node_modules", "dist", "types"],
		environment: "node",
		globals: true,
		nodeOptions: ["--conditions=json-dev"],
		env: {
			NODE_ENV: "development"
		},
		testTimeout: 10000,
		reporters: [["default", { summary: false }]],
		logHeapUsage: true,
		// pool: "forks",
		// poolOptions: {
		// 	forks: {
		// 		singleFork: false
		// 	}
		// },

		silent: false,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			include: ["src/**/*.mts"],
			all: true
		}
	}
});
