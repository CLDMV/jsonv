/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /.configs/vitest.config.mjs
 *	@Date: 2026-01-18T21:20:36-08:00 (1768800036)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-07T21:47:04-08:00 (1794116824)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { defineConfig, mergeConfig } from "vitest/config";
import { devCondition } from "@cldmv/configs/vitest.config.mjs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// devCondition() puts the package's jsonv-dev condition (which maps the package exports to src/)
// ahead of Vite's default conditions for the client and SSR resolvers, and on the worker command line.
// `--mode=dist` (npm run test:dist) leaves the -dev condition off, so tests that import "@cldmv/jsonv" by name run
// against the build in dist/ instead of src/.
export default defineConfig(({ mode }) =>
	mergeConfig(
		mode === "dist" ? {} : devCondition({ root }),
		defineConfig({
		pool: "forks",
		test: {
			// CLDMV standing convention: vitest test files are always named `*.test.vitest.mjs`.
			include: ["tests/**/*.test.vitest.mjs"],
			exclude: ["node_modules", "dist", "types"],
			environment: "node",
			globals: true,
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
	})
	)
);
