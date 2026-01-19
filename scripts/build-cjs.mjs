/**
 * Build CJS wrappers for CommonJS compatibility
 * Creates .cjs files that load the ESM modules
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const cjsDir = join(distDir, "cjs");

console.log("\n📦 Building CJS wrappers...\n");

// Ensure CJS directory exists
if (!existsSync(cjsDir)) {
	mkdirSync(cjsDir, { recursive: true });
}

// Create CJS loader that dynamically imports ESM
const loaderContent = `/**
 * CommonJS loader for @cldmv/jsonv
 * Dynamically imports ESM modules
 */

module.exports = (async () => {
	const esm = await import('../index.mjs');
	return esm;
})();
`;

const loaderFile = join(cjsDir, "loader.cjs");
writeFileSync(loaderFile, loaderContent, "utf8");
console.log(`✓ Created CJS loader → ${loaderFile}`);

// Create main CJS entry point
const indexContent = `/**
 * CommonJS entry point for @cldmv/jsonv
 */

const loader = require('./loader.cjs');

module.exports = loader;
`;

const indexFile = join(cjsDir, "index.cjs");
writeFileSync(indexFile, indexContent, "utf8");
console.log(`✓ Created CJS index → ${indexFile}`);

// Prepare CJS types directory
const cjsTypesDir = join(distDir, "types", "cjs");
if (!existsSync(cjsTypesDir)) {
	mkdirSync(cjsTypesDir, { recursive: true });
}

// Create CJS wrappers for year modules
const cjsYearsDir = join(cjsDir, "years");
const cjsYearsTypesDir = join(cjsTypesDir, "years");

if (!existsSync(cjsYearsDir)) {
	mkdirSync(cjsYearsDir, { recursive: true });
}
if (!existsSync(cjsYearsTypesDir)) {
	mkdirSync(cjsYearsTypesDir, { recursive: true });
}

// Get all year .mjs files from dist/years/
const distYearsDir = join(distDir, "years");
const yearFiles = readdirSync(distYearsDir)
	.filter((f) => f.match(/^\d{4}\.mjs$/))
	.map((f) => parseInt(f.replace(".mjs", "")));

for (const year of yearFiles) {
	const yearCjsContent = `/**
 * CommonJS wrapper for @cldmv/jsonv/${year}
 */

const loader = (async () => {
	const esm = await import('../../years/${year}.mjs');
	return esm;
})();

module.exports = loader;
`;

	const yearFile = join(cjsYearsDir, `${year}.cjs`);
	writeFileSync(yearFile, yearCjsContent, "utf8");
}
console.log(`✓ Created ${yearFiles.length} CJS year modules`);

// Generate CJS type declarations for all years
for (const year of yearFiles) {
	const yearDts = `export * from '../../years/${year}.mjs';
import jsonv from '../../years/${year}.mjs';
export default jsonv;
`;
	writeFileSync(join(cjsYearsTypesDir, `${year}.d.cts`), yearDts, "utf8");
}
console.log(`✓ Created ${yearFiles.length} CJS year types`);

// Create CJS loader utility
const loaderCjsContent = `/**
 * CommonJS wrapper for @cldmv/jsonv/loader
 */

const loader = (async () => {
	const esm = await import('../../years/loader.mjs');
	return esm;
})();

module.exports = loader;
`;

const loaderYearFile = join(cjsYearsDir, "loader.cjs");
writeFileSync(loaderYearFile, loaderCjsContent, "utf8");
console.log(`✓ Created CJS loader → dist/cjs/years/loader.cjs`);

// Create .d.cts type declarations for CJS modules
console.log("\n📝 Generating CJS type declarations...\n");

// Main index.d.cts
const indexDts = `export * from '../index.mjs';
import jsonv from '../index.mjs';
export default jsonv;
`;
writeFileSync(join(cjsTypesDir, "index.d.cts"), indexDts, "utf8");
console.log(`✓ Created CJS types → dist/types/cjs/index.d.cts`);

// Loader type
const loaderDts = `export * from '../../years/loader.mjs';
`;
writeFileSync(join(cjsYearsTypesDir, "loader.d.cts"), loaderDts, "utf8");
console.log(`✓ Created CJS loader types → dist/types/cjs/years/loader.d.cts`);

console.log("\n✅ CJS wrappers built successfully\n");
