/**
 * Tests for diagnose() and info() methods
 * Phase 6: Feature detection and diagnostics
 */

import { describe, it, expect } from "vitest";
import JSONV from "../src/index.mjs";

describe("diagnose()", () => {
	describe("ES2011 (JSON5) Features", () => {
		it("Should detect comments (single-line)", () => {
			const result = JSONV.diagnose(`{
				// This is a comment
				value: 123
			}`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("comments");
			expect(result.compatibility.json5).toBe(true);
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect comments (multi-line)", () => {
			const result = JSONV.diagnose(`{
				/* This is a
				   multi-line comment */
				value: 123
			}`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("comments");
		});

		it("Should detect unquoted keys", () => {
			const result = JSONV.diagnose(`{ name: "value" }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("unquoted-keys");
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect single-quoted strings", () => {
			const result = JSONV.diagnose(`{ "name": 'value' }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("single-quoted-strings");
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect trailing commas", () => {
			const result = JSONV.diagnose(`{ a: 1, b: 2, }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("trailing-commas");
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect hex literals", () => {
			const result = JSONV.diagnose(`{ value: 0xFF }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("hex-literals");
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect leading decimal point", () => {
			const result = JSONV.diagnose(`{ value: .5 }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("decimal-points");
		});

		it("Should detect trailing decimal point", () => {
			const result = JSONV.diagnose(`{ value: 5. }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("decimal-points");
		});

		it("Should detect Infinity", () => {
			const result = JSONV.diagnose(`{ value: Infinity }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("special-numbers");
			expect(result.compatibility.json).toBe(false);
		});

		it("Should detect -Infinity", () => {
			const result = JSONV.diagnose(`{ value: -Infinity }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("special-numbers");
		});

		it("Should detect NaN", () => {
			const result = JSONV.diagnose(`{ value: NaN }`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("special-numbers");
		});

		it("Should detect pure JSON (no special features)", () => {
			const result = JSONV.diagnose(`{ "name": "value", "count": 123 }`);
			expect(result.year).toBe(2011);
			expect(result.features).toHaveLength(0);
			expect(result.compatibility.json).toBe(true);
			expect(result.compatibility.json5).toBe(true);
		});
	});

	describe("ES2015 Features", () => {
		it("Should detect binary literals", () => {
			const result = JSONV.diagnose(`{ value: 0b1010 }`);
			expect(result.year).toBe(2015);
			expect(result.features).toContain("binary-literals");
			expect(result.compatibility.json5).toBe(false);
		});

		it("Should detect octal literals (0o syntax)", () => {
			const result = JSONV.diagnose(`{ value: 0o755 }`);
			expect(result.year).toBe(2015);
			expect(result.features).toContain("octal-literals");
			expect(result.compatibility.json5).toBe(false);
		});

		it("Should detect octal literals (0 prefix)", () => {
			const result = JSONV.diagnose(`{ value: 0755 }`);
			expect(result.year).toBe(2015);
			expect(result.features).toContain("octal-literals");
		});

		it("Should detect template literals", () => {
			const result = JSONV.diagnose("{ value: `template string` }");
			expect(result.year).toBe(2015);
			expect(result.features).toContain("template-literals");
			expect(result.compatibility.json5).toBe(false);
		});

		it("Should detect internal references with template interpolation", () => {
			const result = JSONV.diagnose("{ host: 'localhost', port: 8080, url: `http://${host}:${port}` }");
			expect(result.year).toBe(2015);
			expect(result.features).toContain("template-literals");
			expect(result.features).toContain("internal-references");
			expect(result.compatibility.json5).toBe(false);
		});
	});

	describe("ES2020 Features", () => {
		it("Should detect BigInt literals", () => {
			const result = JSONV.diagnose(`{ value: 9007199254740992n }`);
			expect(result.year).toBe(2020);
			expect(result.features).toContain("bigint");
			expect(result.compatibility.json5).toBe(false);
			expect(result.warnings).toContain("Uses BigInt literals - requires ES2020+ or polyfill");
		});

		it("Should detect hex BigInt", () => {
			const result = JSONV.diagnose(`{ value: 0xFFFFFFFFFFFFFFFFn }`);
			expect(result.year).toBe(2020);
			expect(result.features).toContain("bigint");
			expect(result.features).toContain("hex-literals");
		});
	});

	describe("ES2021 Features", () => {
		it("Should detect numeric separators", () => {
			const result = JSONV.diagnose(`{ value: 1_000_000 }`);
			expect(result.year).toBe(2021);
			expect(result.features).toContain("numeric-separators");
			expect(result.compatibility.json5).toBe(false);
			expect(result.warnings).toContain("Uses numeric separators - requires ES2021+");
		});

		it("Should detect numeric separators in hex", () => {
			const result = JSONV.diagnose(`{ value: 0xFF_AA_BB }`);
			expect(result.year).toBe(2021);
			expect(result.features).toContain("numeric-separators");
			expect(result.features).toContain("hex-literals");
		});

		it("Should detect numeric separators in binary", () => {
			const result = JSONV.diagnose(`{ value: 0b1111_0000 }`);
			expect(result.year).toBe(2021);
			expect(result.features).toContain("numeric-separators");
			expect(result.features).toContain("binary-literals");
		});

		it("Should detect numeric separators in BigInt", () => {
			const result = JSONV.diagnose(`{ value: 9_007_199_254_740_992n }`);
			expect(result.year).toBe(2021);
			expect(result.features).toContain("numeric-separators");
			expect(result.features).toContain("bigint");
		});
	});

	describe("Internal References", () => {
		it("Should detect bare identifier references", () => {
			const result = JSONV.diagnose(`{ port: 8080, backup: port }`);
			expect(result.features).toContain("internal-references");
			expect(result.warnings).toContain("Uses internal references - requires jsonv parser (not compatible with standard JSON/JSON5)");
		});

		it("Should detect nested property references", () => {
			const result = JSONV.diagnose(`{ server: { port: 8080 }, url: server.port }`);
			expect(result.features).toContain("internal-references");
		});
	});

	describe("Multiple Features", () => {
		it("Should detect multiple JSON5 features", () => {
			const result = JSONV.diagnose(`{
				// Comment
				name: 'value',
				count: 0xFF,
			}`);
			expect(result.year).toBe(2011);
			expect(result.features).toContain("comments");
			expect(result.features).toContain("unquoted-keys");
			expect(result.features).toContain("single-quoted-strings");
			expect(result.features).toContain("hex-literals");
			expect(result.features).toContain("trailing-commas");
		});

		it("Should detect mixed ES2015 and ES2021 features", () => {
			const result = JSONV.diagnose(`{
				binary: 0b1111_0000,
				octal: 0o755_123
			}`);
			expect(result.year).toBe(2021);
			expect(result.features).toContain("binary-literals");
			expect(result.features).toContain("octal-literals");
			expect(result.features).toContain("numeric-separators");
		});

		it("Should detect highest year required", () => {
			const result = JSONV.diagnose(`{
				// ES2011
				hex: 0xFF,
				// ES2015
				binary: 0b1010,
				// ES2020
				big: 999n,
				// ES2021
				num: 1_000_000
			}`);
			expect(result.year).toBe(2021);
		});
	});

	describe("Compatibility Checking", () => {
		it("Should mark JSON-compatible input as such", () => {
			const result = JSONV.diagnose(`{"name":"value","count":123}`);
			expect(result.compatibility.json).toBe(true);
			expect(result.compatibility.json5).toBe(true);
			expect(result.warnings).toHaveLength(0);
		});

		it("Should mark JSON5-compatible but not JSON-compatible", () => {
			const result = JSONV.diagnose(`{ name: 'value' }`);
			expect(result.compatibility.json).toBe(false);
			expect(result.compatibility.json5).toBe(true);
		});

		it("Should mark neither JSON nor JSON5 compatible", () => {
			const result = JSONV.diagnose(`{ value: 0b1010 }`);
			expect(result.compatibility.json).toBe(false);
			expect(result.compatibility.json5).toBe(false);
		});
	});

	describe("Value Parsing", () => {
		it("Should return parsed value", () => {
			const result = JSONV.diagnose(`{ name: "test", value: 123 }`);
			expect(result.value).toEqual({ name: "test", value: 123 });
		});

		it("Should resolve internal references in value", () => {
			const result = JSONV.diagnose(`{ port: 8080, backup: port }`);
			expect(result.value).toEqual({ port: 8080, backup: 8080 });
		});

		it("Should handle BigInt in value", () => {
			const result = JSONV.diagnose(`{ value: 9007199254740992n }`);
			expect(result.value.value).toBe(9007199254740992n);
		});
	});
});

describe("info()", () => {
	it("Should return year and value", () => {
		const result = JSONV.info(`{ value: 0b1010 }`);
		expect(result.year).toBe(2015);
		expect(result.value).toEqual({ value: 10 });
	});

	it("Should detect ES2011", () => {
		const result = JSONV.info(`{ name: 'value' }`);
		expect(result.year).toBe(2011);
		expect(result.value).toEqual({ name: "value" });
	});

	it("Should detect ES2020", () => {
		const result = JSONV.info(`{ big: 999n }`);
		expect(result.year).toBe(2020);
		expect(result.value.big).toBe(999n);
	});

	it("Should detect ES2021", () => {
		const result = JSONV.info(`{ num: 1_000_000 }`);
		expect(result.year).toBe(2021);
		expect(result.value).toEqual({ num: 1000000 });
	});

	it("Should not include features or warnings", () => {
		const result = JSONV.info(`{ value: 0b1010 }`);
		expect(result).not.toHaveProperty("features");
		expect(result).not.toHaveProperty("warnings");
		expect(result).not.toHaveProperty("compatibility");
	});
});
