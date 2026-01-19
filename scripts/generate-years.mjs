/**
 * Generate year forwarding files directly in dist/
 * Runs after TypeScript compilation
 */

import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distYearsDir = join(rootDir, "dist", "years");

console.log("\n📅 Generating year forwarding modules...\n");

// Read compiled year-resolver
const resolverContent = readFileSync(join(distYearsDir, "year-resolver.mjs"), "utf8");

// Extract PUBLISHED_YEARS
const publishedMatch = resolverContent.match(/export const PUBLISHED_YEARS\s*=\s*\[([^\]]+)\]/);
if (!publishedMatch) {
	throw new Error("Could not find PUBLISHED_YEARS in year-resolver.mjs");
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
