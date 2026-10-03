/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /scripts/build-cjs.mjs
 *	@Date: 2026-01-18T21:20:36-08:00 (1768800036)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T12:20:18-07:00 (1790968818)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Build CJS wrappers for CommonJS compatibility.
 *
 * Each .cjs file is a thin wrapper that loads its ESM counterpart through Node's
 * synchronous require(esm), so `require("@cldmv/jsonv")` returns the same module
 * namespace object that `import` gives. The ESM graph therefore must not use
 * top-level await (require(esm) rejects it with ERR_REQUIRE_ASYNC_MODULE).
 */

import { mkdirSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const cjsDir = join(distDir, "cjs");
const cjsYearsDir = join(cjsDir, "years");
const cjsTypesDir = join(distDir, "types", "cjs");
const cjsYearsTypesDir = join(cjsTypesDir, "years");

console.log("\n📦 Building CJS wrappers...\n");

// Start from a clean dist/cjs so a wrapper removed here (e.g. the old async loader.cjs)
// never lingers from an earlier build.
rmSync(cjsDir, { recursive: true, force: true });
mkdirSync(cjsYearsDir, { recursive: true });
mkdirSync(cjsYearsTypesDir, { recursive: true });

/**
 * Source of a CJS wrapper that synchronously requires an ESM file.
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
		\`@cldmv/jsonv: require() needs Node.js ^20.19.0 or >=22.12.0 (this is \${process.version}). On older Node.js, load the package with import() instead.\`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

module.exports = require("${esmPath}");
`;
}

// Main CJS entry point
writeFileSync(join(cjsDir, "index.cjs"), wrapper("@cldmv/jsonv", "../index.mjs"), "utf8");
console.log("✓ Created CJS index → dist/cjs/index.cjs");

// CJS wrappers for every module under dist/years/: the year modules plus the
// loader and year-resolver utilities, all reachable through the "./*" export.
const yearModules = readdirSync(join(distDir, "years"))
	.filter((f) => f.endsWith(".mjs"))
	.map((f) => f.slice(0, -".mjs".length));

for (const name of yearModules) {
	writeFileSync(join(cjsYearsDir, `${name}.cjs`), wrapper(`@cldmv/jsonv/${name}`, `../../years/${name}.mjs`), "utf8");
}
console.log(`✓ Created ${yearModules.length} CJS year/utility wrappers → dist/cjs/years/`);

// CJS type declarations. require(esm) returns the ESM namespace, so the
// declarations re-export the ESM types (default export included when present).
console.log("\n📝 Generating CJS type declarations...\n");

const indexDts = `export * from '../index.mjs';
import jsonv from '../index.mjs';
export default jsonv;
`;
writeFileSync(join(cjsTypesDir, "index.d.cts"), indexDts, "utf8");
console.log("✓ Created CJS types → dist/types/cjs/index.d.cts");

for (const name of yearModules) {
	const hasDefault = /^\d{4}$/.test(name);
	const dts = hasDefault
		? `export * from '../../years/${name}.mjs';
import jsonv from '../../years/${name}.mjs';
export default jsonv;
`
		: `export * from '../../years/${name}.mjs';
`;
	writeFileSync(join(cjsYearsTypesDir, `${name}.d.cts`), dts, "utf8");
}
console.log(`✓ Created ${yearModules.length} CJS year/utility types → dist/types/cjs/years/`);

console.log("\n✅ CJS wrappers built successfully\n");
