/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /scripts/generate-years.mjs
 *	@Date: 2026-01-18T21:20:36-08:00 (1768800036)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T16:28:09-08:00 (1793579289)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Generate the year modules that only exist in dist/, plus the CommonJS wrappers.
 * Runs after tsup (`npm run build`).
 *
 *  - dist/years/<year>.mjs for every unpublished year: forwards to the nearest published year.
 *  - dist/years/<name>.cjs beside every dist/years/<name>.mjs (the years, loader and year-resolver,
 *    all reachable through the "./*" export): a thin wrapper that loads its ESM sibling through
 *    Node's synchronous require(esm), like dist/index.cjs (copied from src/index.cjs) does for the root.
 *    The ESM graph therefore must not use top-level await (require(esm) rejects it with
 *    ERR_REQUIRE_ASYNC_MODULE).
 */

import { writeFileSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distYearsDir = join(rootDir, "dist", "years");

console.log("\n📅 Generating year forwarding modules...\n");

// Read PUBLISHED_YEARS from the source (the built year-resolver.mjs is minified)
const resolverContent = readFileSync(join(rootDir, "src", "years", "year-resolver.mts"), "utf8");

// Extract PUBLISHED_YEARS
const publishedMatch = resolverContent.match(/export const PUBLISHED_YEARS\s*=\s*\[([^\]]+)\]/);
if (!publishedMatch) {
	throw new Error("Could not find PUBLISHED_YEARS in src/years/year-resolver.mts");
}

const PUBLISHED_YEARS = publishedMatch[1]
	.split(",")
	.map((s) => parseInt(s.trim()))
	.filter((n) => !isNaN(n));

const MIN_YEAR = Math.min(...PUBLISHED_YEARS);
const MAX_YEAR = new Date().getFullYear() + 5;

console.log(`✓ Generating years ${MIN_YEAR}-${MAX_YEAR}`);

let generated = 0;

for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
	if (PUBLISHED_YEARS.includes(year)) continue;

	// Find target year
	let targetYear = PUBLISHED_YEARS[0];
	for (const pubYear of PUBLISHED_YEARS) {
		if (pubYear <= year) targetYear = pubYear;
	}

	// Generate .mjs forwarding file
	const content = `/**
 * ES${year} - forwards to ES${targetYear}
 */
export * from "./${targetYear}.mjs";
export { default } from "./${targetYear}.mjs";
`;

	writeFileSync(join(distYearsDir, `${year}.mjs`), content, "utf8");
	generated++;
}

console.log(`✓ Generated ${generated} forwarding files\n`);

/**
 * Source of a CJS wrapper that synchronously requires its ESM sibling.
 * @param {string} specifier - Package specifier the wrapper stands for (for the comment and error message).
 * @param {string} esmPath - Path of the ESM file, relative to the wrapper.
 * @returns {string} The wrapper source.
 */
function wrapper(specifier, esmPath) {
	return `/**
 * CommonJS entry for ${specifier}
 */
"use strict";

// A thin wrapper: it loads the ESM build through Node's synchronous require(esm), so
// require() returns the same module namespace object as import. Node.js versions without
// require(esm) would fail with a bare ERR_REQUIRE_ESM, so fail early with a message that
// says what to do instead.
if (!process.features?.require_module) {
	const error = new Error(
		\`@cldmv/jsonv: require() needs Node.js ^20.19.0 or >=22.13.0 (this is \${process.version}). On older Node.js, load the package with import() instead.\`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

module.exports = require("${esmPath}");
`;
}

console.log("📦 Generating CJS wrappers...\n");

const yearModules = readdirSync(distYearsDir)
	.filter((f) => f.endsWith(".mjs"))
	.map((f) => f.slice(0, -".mjs".length));

for (const name of yearModules) {
	writeFileSync(join(distYearsDir, `${name}.cjs`), wrapper(`@cldmv/jsonv/${name}`, `./${name}.mjs`), "utf8");
}
console.log(`✓ Created ${yearModules.length} CJS year/utility wrappers → dist/years/\n`);
