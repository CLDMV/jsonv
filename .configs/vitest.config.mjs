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
import { DefaultReporter } from "vitest/reporters";

export class CustomReporter extends DefaultReporter {
	onPathsCollected(paths) {
		super.onPathsCollected(paths);

		this.renderSucceed = false;
	}
}

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
		include: ["tests/**/*.test.{js,mjs,ts}", "tests/**/*.test.vitest.{js,mjs,ts}"],
		exclude: ["node_modules", "dist", "types"],
		environment: "node",
		globals: true,
		nodeOptions: ["--conditions=json-dev"],
		env: {
			NODE_ENV: "development"
		},
		testTimeout: 10000,
		// reporters: [new CustomReporter()],
		reporters: [["default", { summary: false }]],
		logHeapUsage: true,
		// pool: "forks",
		// poolOptions: {
		// 	forks: {
		// 		singleFork: false
		// 	}
		// },

		silent: false
	}
});
