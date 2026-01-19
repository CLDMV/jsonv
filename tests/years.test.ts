/**
 * Tests for year-based modules and year resolution
 * Phase 6: Year modules with backwards resolution
 */

import { describe, it, expect } from "vitest";
import { resolveYear, isPublishedYear, getPublishedYears, LATEST_YEAR } from "../src/years/year-resolver.mjs";
import { loadYear, getLoadedYear, hasYearModule, getAvailableYears } from "../src/years/loader.mjs";

describe("Year Resolution", () => {
	describe("resolveYear()", () => {
		it("Should resolve exact published years", () => {
			expect(resolveYear(2011)).toBe(2011);
			expect(resolveYear(2015)).toBe(2015);
			expect(resolveYear(2020)).toBe(2020);
			expect(resolveYear(2021)).toBe(2021);
		});

		it("Should resolve 2012-2014 to 2011", () => {
			expect(resolveYear(2012)).toBe(2011);
			expect(resolveYear(2013)).toBe(2011);
			expect(resolveYear(2014)).toBe(2011);
		});

		it("Should resolve 2016-2019 to 2015", () => {
			expect(resolveYear(2016)).toBe(2015);
			expect(resolveYear(2017)).toBe(2015);
			expect(resolveYear(2018)).toBe(2015);
			expect(resolveYear(2019)).toBe(2015);
		});

		it("Should resolve 2022-2025 to 2021", () => {
			expect(resolveYear(2022)).toBe(2021);
			expect(resolveYear(2023)).toBe(2021);
			expect(resolveYear(2024)).toBe(2021);
			expect(resolveYear(2025)).toBe(2021);
		});

		it("Should resolve future years to latest", () => {
			expect(resolveYear(2026)).toBe(LATEST_YEAR);
			expect(resolveYear(2030)).toBe(LATEST_YEAR);
			expect(resolveYear(2100)).toBe(LATEST_YEAR);
		});

		it("Should resolve years before 2011 to 2011", () => {
			expect(resolveYear(2010)).toBe(2011);
			expect(resolveYear(2000)).toBe(2011);
			expect(resolveYear(1999)).toBe(2011);
		});
	});

	describe("isPublishedYear()", () => {
		it("Should identify published years", () => {
			expect(isPublishedYear(2011)).toBe(true);
			expect(isPublishedYear(2015)).toBe(true);
			expect(isPublishedYear(2020)).toBe(true);
			expect(isPublishedYear(2021)).toBe(true);
		});

		it("Should identify non-published years", () => {
			expect(isPublishedYear(2012)).toBe(false);
			expect(isPublishedYear(2016)).toBe(false);
			expect(isPublishedYear(2022)).toBe(false);
		});
	});

	describe("getPublishedYears()", () => {
		it("Should return all published years", () => {
			const years = getPublishedYears();
			expect(years).toEqual([2011, 2015, 2020, 2021]);
		});
	});
});

describe("Year Loader", () => {
	describe("getLoadedYear()", () => {
		it("Should return resolved year", () => {
			expect(getLoadedYear(2023)).toBe(2021);
			expect(getLoadedYear(2017)).toBe(2015);
			expect(getLoadedYear(2011)).toBe(2011);
		});
	});

	describe("hasYearModule()", () => {
		it("Should detect available year modules", () => {
			expect(hasYearModule(2011)).toBe(true);
			expect(hasYearModule(2015)).toBe(true);
			expect(hasYearModule(2017)).toBe(true); // Forwards to 2015
			expect(hasYearModule(2023)).toBe(true); // Forwards to 2021
		});

		it("Should reject unavailable years", () => {
			expect(hasYearModule(2026)).toBe(false);
			expect(hasYearModule(2010)).toBe(false);
		});
	});

	describe("getAvailableYears()", () => {
		it("Should return all year modules (2011-2025)", () => {
			const years = getAvailableYears();
			expect(years).toHaveLength(15); // 2011-2025 inclusive
			expect(years[0]).toBe(2011);
			expect(years[years.length - 1]).toBe(2025);
		});
	});

	describe("loadYear()", () => {
		it("Should load ES2011 module", async () => {
			const jsonv = await loadYear(2011);
			expect(jsonv.parse).toBeTypeOf("function");
			expect(jsonv.stringify).toBeTypeOf("function");
		});

		it("Should load ES2015 module", async () => {
			const jsonv = await loadYear(2015);
			expect(jsonv.parse).toBeTypeOf("function");
			expect(jsonv.stringify).toBeTypeOf("function");
		});

		it("Should load ES2020 module", async () => {
			const jsonv = await loadYear(2020);
			expect(jsonv.parse).toBeTypeOf("function");
			expect(jsonv.stringify).toBeTypeOf("function");
		});

		it("Should load ES2021 module", async () => {
			const jsonv = await loadYear(2021);
			expect(jsonv.parse).toBeTypeOf("function");
			expect(jsonv.stringify).toBeTypeOf("function");
		});

		it("Should resolve 2017 to 2015 module", async () => {
			const jsonv = await loadYear(2017);
			// Should work with ES2015 features (binary literals)
			const result = jsonv.parse("{ value: 0b1010 }");
			expect(result.value).toBe(10);
		});

		it("Should resolve 2023 to 2021 module", async () => {
			const jsonv = await loadYear(2023);
			// Should work with ES2021 features (numeric separators)
			const result = jsonv.parse("{ value: 1_000_000 }");
			expect(result.value).toBe(1000000);
		});

		it("Should resolve future year to latest", async () => {
			const jsonv = await loadYear(2030);
			// Should work with latest features
			const result = jsonv.parse("{ value: 999n }");
			expect(result.value).toBe(999n);
		});

		it("Should resolve old year to 2011", async () => {
			const jsonv = await loadYear(2010);
			// Should work with JSON5 features
			const result = jsonv.parse("{ name: 'test' }"); // Single quotes
			expect(result.name).toBe("test");
		});
	});
});

describe("Year Module Functionality", () => {
	it("ES2011 module should parse JSON5", async () => {
		const jsonv = await loadYear(2011);
		const result = jsonv.parse(`{
			// Comment
			name: 'value',
			count: 0xFF,
		}`);
		expect(result).toEqual({ name: "value", count: 255 });
	});

	it("ES2015 module should parse binary/octal", async () => {
		const jsonv = await loadYear(2015);
		const result = jsonv.parse(`{
			binary: 0b1111,
			octal: 0o755
		}`);
		expect(result).toEqual({ binary: 15, octal: 493 });
	});

	it("ES2020 module should parse BigInt", async () => {
		const jsonv = await loadYear(2020);
		const result = jsonv.parse("{ big: 9007199254740992n }");
		expect(result.big).toBe(9007199254740992n);
	});

	it("ES2021 module should parse numeric separators", async () => {
		const jsonv = await loadYear(2021);
		const result = jsonv.parse("{ num: 1_000_000, hex: 0xFF_AA }");
		expect(result.num).toBe(1000000);
		expect(result.hex).toBe(0xffaa);
	});

	it("All year modules should have complete API", async () => {
		for (const year of [2011, 2015, 2020, 2021, 2017, 2023]) {
			const jsonv = await loadYear(year);
			expect(jsonv.parse).toBeTypeOf("function");
			expect(jsonv.stringify).toBeTypeOf("function");
			expect(jsonv.diagnose).toBeTypeOf("function");
			expect(jsonv.info).toBeTypeOf("function");
			expect(jsonv.rawJSON).toBeTypeOf("function");
			expect(jsonv.isRawJSON).toBeTypeOf("function");
		}
	});
});
