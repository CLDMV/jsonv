/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /tests/run-vitest.mjs
 *	@Date: 2026-09-28T02:57:41+00:00 (1790564261)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T12:20:39-07:00 (1790968839)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview OOM-safe Vitest runner for jsonv — delegates to
 * @cldmv/vitest-runner, which spawns each test file in its own child process and
 * (under coverage) uses a blob-per-file + `--mergeReports` strategy so a single
 * process never holds coverage data for the whole suite. Mirrors how @cldmv/slothlet
 * runs its suite.
 *
 * Usage:
 *   node tests/run-vitest.mjs                 # run all tests
 *   node tests/run-vitest.mjs --coverage      # with coverage (verbose)
 *   node tests/run-vitest.mjs --coverage-quiet # with coverage (progress bar + summary)
 *   node tests/run-vitest.mjs <pattern...>     # filter by path/name
 *
 *   Args before a `--` delimiter are forwarded to Vitest; args after it are test
 *   patterns. A value-taking flag needs the delimiter, e.g.:
 *     node tests/run-vitest.mjs --reporter verbose -- <pattern...>
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@cldmv/vitest-runner";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

// A `--` delimiter separates forwarded Vitest args (before it) from test patterns
// (after it), so a value-taking flag such as `--reporter verbose` isn't misread as a
// pattern. Without a `--`, the legacy heuristic applies: non-flag tokens are test
// patterns and flag tokens are forwarded to vitest.
const delimiter = argv.indexOf("--");
const forwarded = delimiter === -1 ? argv.filter((a) => a.startsWith("-")) : argv.slice(0, delimiter);
const testPatterns = delimiter === -1 ? argv.filter((a) => !a.startsWith("-")) : argv.slice(delimiter + 1);

const coverageQuiet = forwarded.includes("--coverage-quiet");
const coverage = coverageQuiet || forwarded.includes("--coverage");
const passthrough = forwarded.filter((a) => a !== "--coverage" && a !== "--coverage-quiet");

// VITEST_WORKERS overrides the worker count; ignore an unset / invalid / non-positive value.
const parsedWorkers = parseInt(process.env.VITEST_WORKERS ?? "", 10);
const workers = Number.isInteger(parsedWorkers) && parsedWorkers > 0 ? parsedWorkers : 4;

const code = await run({
	cwd: root,
	testDir: "tests",
	vitestConfig: ".configs/vitest.config.mjs",
	// CLDMV standing convention: vitest test files are always named `*.test.vitest.mjs`.
	testFilePattern: /\.test\.vitest\.mjs$/,
	testPatterns,
	workers,
	coverageQuiet,
	vitestArgs: [...(coverage ? ["--coverage"] : []), ...passthrough],
	nodeEnv: process.env.NODE_ENV || "development"
});
process.exit(code);
