/**
 * Test runner for jsonv fixture files
 * Loads .jsonv files from fixtures/ directory and validates them
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseWithOptions } from "../src/parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

/**
 * Get all .jsonv files recursively from a directory
 */
function getFixtureFiles(dir) {
	const files = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...getFixtureFiles(fullPath));
		} else if (entry.endsWith(".jsonv")) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Determine if a fixture file should fail parsing
 */
function isViolationFixture(filepath) {
	return filepath.includes("/violations/") || filepath.includes("\\violations\\");
}

/**
 * Extract ES year from fixture path
 */
function getYearFromPath(filepath) {
	const match = filepath.match(/\/(20\d{2}(-20\d{2})?)\//);
	return match ? match[1] : null;
}

describe("jsonv fixtures", () => {
	const fixtureFiles = getFixtureFiles(FIXTURES_DIR);

	describe("fixture file discovery", () => {
		it("should find fixture files", () => {
			expect(fixtureFiles.length).toBeGreaterThan(0);
		});

		it("should have fixtures for each year", () => {
			const years = ["2011", "2015", "2020", "2021"];
			for (const year of years) {
				const yearFixtures = fixtureFiles.filter((f) => f.includes(`/${year}/`) || f.includes(`\\${year}\\`));
				expect(yearFixtures.length).toBeGreaterThan(0);
			}
		});
	});

	// Group fixtures by year for organized test output
	const fixturesByYear = {};
	for (const file of fixtureFiles) {
		const year = getYearFromPath(file) || "unknown";
		if (!fixturesByYear[year]) {
			fixturesByYear[year] = [];
		}
		fixturesByYear[year].push(file);
	}

	// TODO: Once parser is implemented, add actual parsing tests
	// For now, just validate that files exist and are readable
	for (const [year, files] of Object.entries(fixturesByYear)) {
		describe(`ES${year} fixtures`, () => {
			for (const file of files) {
				const relativePath = file.replace(FIXTURES_DIR, "").replace(/^[/\\]/, "");
				const isViolation = isViolationFixture(file);

				it(`should load: ${relativePath}`, () => {
					const content = readFileSync(file, "utf-8");
					expect(content).toBeTruthy();
					expect(content.length).toBeGreaterThan(0);

					// Basic sanity checks on file content
					if (isViolation) {
						// Violation files should have error documentation in comments
						const hasInvalidKeyword = /INVALID/i.test(content);
						const hasErrorKeyword = /ERROR/i.test(content);
						expect(hasInvalidKeyword || hasErrorKeyword, `Violation file ${relativePath} should document the error in comments`).toBe(true);
					}
				});

				// Phase 3: Actually parse the file
				it(`should parse: ${relativePath}`, () => {
					const content = readFileSync(file, "utf-8");
					const year = getYearFromPath(file);
					const yearNum = year ? parseInt(year.split("-")[0]) : undefined;

					if (isViolation) {
						// Violation fixtures should throw parse errors (test in strict mode)
						expect(
							() => parseWithOptions(content, { year: yearNum, mode: "jsonv", strictBigInt: true }),
							`Violation file ${relativePath} should fail to parse`
						).toThrow();
					} else {
						// Valid fixtures should parse successfully (test in non-strict mode)
						expect(() => {
							const result = parseWithOptions(content, { year: yearNum, mode: "jsonv", strictBigInt: false });
							expect(result).toBeDefined();
						}, `Valid fixture ${relativePath} should parse successfully`).not.toThrow();
					}
				});
			}
		});
	}

	// The 2011 feature fixtures that use only JSON5 syntax also parse under
	// mode "json5"; the rest use a jsonv extension and are rejected there.
	describe("ES2011 feature fixtures under mode: json5", () => {
		const JSON5_ONLY = [
			"comments-multi-line.jsonv",
			"comments-single-line.jsonv",
			"decimal-points.jsonv",
			"infinity-nan.jsonv",
			"multiline-strings.jsonv",
			"single-quoted-strings.jsonv",
			"trailing-commas.jsonv",
			"unquoted-keys.jsonv"
		];
		const JSONV_EXTENSIONS = [
			["forward-reference.jsonv", "Internal references"],
			["hex-literals.jsonv", "Numeric keys"],
			["internal-refs-bare.jsonv", "Internal references"]
		];
		const read = (name) => readFileSync(join(FIXTURES_DIR, "2011", "features", name), "utf-8");

		it("covers every 2011 feature fixture", () => {
			const listed = [...JSON5_ONLY, ...JSONV_EXTENSIONS.map(([name]) => name)].sort();
			expect(readdirSync(join(FIXTURES_DIR, "2011", "features")).sort()).toEqual(listed);
		});

		for (const name of JSON5_ONLY) {
			it(`should parse in json5 mode: 2011/features/${name}`, () => {
				expect(parseWithOptions(read(name), { year: 2011, mode: "json5" })).toEqual(parseWithOptions(read(name), { year: 2011 }));
			});
		}

		for (const [name, feature] of JSONV_EXTENSIONS) {
			it(`should reject in json5 mode: 2011/features/${name}`, () => {
				expect(() => parseWithOptions(read(name), { year: 2011, mode: "json5" })).toThrow(
					expect.objectContaining({
						code: "FEATURE_NOT_ALLOWED_IN_MODE",
						message: expect.stringContaining(`${feature} not allowed in JSON5 mode`)
					})
				);
			});
		}
	});
});
