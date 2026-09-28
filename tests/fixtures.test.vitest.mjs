/**
 * Test runner for jsonv fixture files
 * Loads .jsonv files from fixtures/ directory and validates them
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parseWithOptions } from "../src/parser.mjs";

const FIXTURES_DIR = join(__dirname, "fixtures");

/**
 * Get all .jsonv files recursively from a directory
 */
function getFixtureFiles(dir: string): string[] {
	const files: string[] = [];
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
function isViolationFixture(filepath: string): boolean {
	return filepath.includes("/violations/") || filepath.includes("\\violations\\");
}

/**
 * Extract ES year from fixture path
 */
function getYearFromPath(filepath: string): string | null {
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
	const fixturesByYear: Record<string, string[]> = {};
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
					const yearNum = year ? (parseInt(year.split("-")[0]) as 2011 | 2015 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025) : undefined;

					if (isViolation) {
						// Violation fixtures should throw parse errors (test in strict mode)
						expect(
							() => parseWithOptions(content, { year: yearNum, strictBigInt: true }),
							`Violation file ${relativePath} should fail to parse`
						).toThrow();
					} else {
						// Valid fixtures should parse successfully (test in non-strict mode)
						expect(() => {
							const result = parseWithOptions(content, { year: yearNum, strictBigInt: false });
							expect(result).toBeDefined();
						}, `Valid fixture ${relativePath} should parse successfully`).not.toThrow();
					}
				});
			}
		});
	}
});
