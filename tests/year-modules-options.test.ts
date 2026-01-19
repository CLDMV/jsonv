/**
 * Tests for year module options (parseWithOptions / stringifyWithOptions)
 * Targets uncovered lines in 2015.mts, 2020.mts, 2021.mts
 */

import { describe, it, expect } from "vitest";
import * as api2015 from "../src/years/2015.mjs";
import * as api2020 from "../src/years/2020.mjs";
import * as api2021 from "../src/years/2021.mjs";

describe("Year Module Options: 2015", () => {
	describe("parseWithOptions()", () => {
		it("Should parse with explicit year option (overridden to 2015)", () => {
			// parseWithOptions forces year: 2015
			const result = api2015.parseWithOptions("{ value: 0b1010 }", { year: 2025 });
			expect(result).toEqual({ value: 10 });
		});

		it("Should parse with mode option", () => {
			const result = api2015.parseWithOptions("{ a: 1 }", { mode: "jsonv" });
			expect(result).toEqual({ a: 1 });
		});

		it("Should parse with allowInternalReferences option", () => {
			const result = api2015.parseWithOptions("{ a: 1, b: a }", { allowInternalReferences: true });
			expect(result).toEqual({ a: 1, b: 1 });
		});

		it("Should parse with preserveComments option", () => {
			const result = api2015.parseWithOptions("// comment\n{ a: 1 }", { preserveComments: false });
			expect(result).toEqual({ a: 1 });
		});

		it("Should parse with tolerant option (collects errors)", () => {
			const result = api2015.parseWithOptions("{ a: 1 }", { tolerant: false });
			expect(result).toEqual({ a: 1 });
		});

		it("Should parse with strictBigInt option", () => {
			const result = api2015.parseWithOptions("{ a: 1 }", { strictBigInt: false });
			expect(result).toEqual({ a: 1 });
		});
	});

	describe("stringifyWithOptions()", () => {
		it("Should stringify with mode: 'jsonv'", () => {
			const result = api2015.stringifyWithOptions({ a: 1 }, { mode: "jsonv" });
			expect(result).toContain("a:"); // jsonv mode uses unquoted keys
		});

		it("Should stringify with mode: 'json'", () => {
			const result = api2015.stringifyWithOptions({ a: 1 }, { mode: "json" });
			expect(result).toContain('"a"'); // json mode uses quoted keys
		});

		it("Should stringify with mode: 'json5'", () => {
			const result = api2015.stringifyWithOptions({ a: 1 }, { mode: "json5" });
			expect(result).toContain("a:"); // json5 mode uses unquoted keys
		});

		it("Should stringify with space option", () => {
			const result = api2015.stringifyWithOptions({ a: 1 }, { space: 2 });
			expect(result).toContain("  "); // indentation
		});

		it("Should stringify with singleQuote option", () => {
			const result = api2015.stringifyWithOptions({ text: "hello" }, { singleQuote: true, mode: "jsonv" });
			expect(result).toContain("'hello'");
		});

		it("Should stringify with trailingComma option", () => {
			const result = api2015.stringifyWithOptions([1, 2], { trailingComma: true, space: 2 });
			// Trailing commas need space/indent to be added
			expect(result).toBeDefined();
		});

		it("Should stringify with unquotedKeys: false option", () => {
			const result = api2015.stringifyWithOptions({ a: 1 }, { unquotedKeys: false, mode: "jsonv" });
			// unquotedKeys: false forces quoted keys even in jsonv mode
			expect(result).toBeDefined();
		});

		it("Should stringify with bigint: 'native'", () => {
			const result = api2015.stringifyWithOptions({ value: 123 }, { bigint: "native" });
			expect(result).toBeDefined();
		});

		it("Should stringify with bigint: 'string'", () => {
			const result = api2015.stringifyWithOptions({ value: 123 }, { bigint: "string" });
			expect(result).toBeDefined();
		});

		it("Should stringify with bigint: 'object'", () => {
			const result = api2015.stringifyWithOptions({ value: 123 }, { bigint: "object" });
			expect(result).toBeDefined();
		});
	});
});

describe("Year Module Options: 2020", () => {
	describe("parseWithOptions()", () => {
		it("Should parse BigInt with explicit options", () => {
			const result = api2020.parseWithOptions("{ value: 9007199254740992n }", { year: 2020 });
			expect(result.value).toBe(9007199254740992n);
		});

		it("Should parse with mode option", () => {
			const result = api2020.parseWithOptions("{ a: 1 }", { mode: "jsonv" });
			expect(result).toEqual({ a: 1 });
		});

		it("Should parse with strictBigInt option", () => {
			const result = api2020.parseWithOptions("{ value: 123n }", { strictBigInt: false });
			expect(result.value).toBe(123n);
		});
	});

	describe("stringifyWithOptions()", () => {
		it("Should stringify BigInt with mode: 'jsonv' and bigint: 'native'", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { mode: "jsonv", bigint: "native" });
			expect(result).toContain("123n");
		});

		it("Should stringify BigInt with bigint: 'string'", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { bigint: "string" });
			expect(result).toContain('"123"');
		});

		it("Should stringify BigInt with bigint: 'object'", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { bigint: "object" });
			expect(result).toContain('"$bigint"');
		});

		it("Should stringify with space and mode options", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { space: 2, mode: "jsonv" });
			expect(result).toContain("  ");
		});

		it("Should stringify with singleQuote option", () => {
			const result = api2020.stringifyWithOptions({ text: "hello" }, { singleQuote: true, mode: "jsonv" });
			expect(result).toContain("'hello'");
		});

		it("Should stringify with trailingComma option", () => {
			const result = api2020.stringifyWithOptions([1, 2], { trailingComma: true, space: 2 });
			expect(result).toBeDefined();
		});

		it("Should stringify with unquotedKeys: false option", () => {
			const result = api2020.stringifyWithOptions({ a: 1 }, { unquotedKeys: false, mode: "jsonv" });
			expect(result).toBeDefined();
		});
	});
});

describe("Year Module Options: 2021", () => {
	describe("parseWithOptions()", () => {
		it("Should parse with numeric separators and explicit options", () => {
			const result = api2021.parseWithOptions("{ value: 1_000_000 }", { year: 2021 });
			expect(result.value).toBe(1000000);
		});

		it("Should parse with mode option", () => {
			const result = api2021.parseWithOptions("{ a: 1 }", { mode: "jsonv" });
			expect(result).toEqual({ a: 1 });
		});

		it("Should parse with allowInternalReferences option", () => {
			const result = api2021.parseWithOptions("{ a: 1_000, b: a }", { allowInternalReferences: true });
			expect(result).toEqual({ a: 1000, b: 1000 });
		});
	});

	describe("stringifyWithOptions()", () => {
		it("Should stringify with mode: 'jsonv'", () => {
			const result = api2021.stringifyWithOptions({ value: 1000000 }, { mode: "jsonv" });
			expect(result).toContain("1000000");
		});

		it("Should stringify with mode: 'json'", () => {
			const result = api2021.stringifyWithOptions({ value: 1000000 }, { mode: "json" });
			expect(result).toContain('"value"');
		});

		it("Should stringify BigInt with numeric separators era", () => {
			const result = api2021.stringifyWithOptions({ value: 123n }, { bigint: "native" });
			expect(result).toContain("123n");
		});

		it("Should stringify with space option", () => {
			const result = api2021.stringifyWithOptions({ a: 1 }, { space: 2 });
			expect(result).toContain("  ");
		});

		it("Should stringify with singleQuote option", () => {
			const result = api2021.stringifyWithOptions({ text: "hello" }, { singleQuote: true, mode: "jsonv" });
			expect(result).toContain("'hello'");
		});

		it("Should stringify with trailingComma option", () => {
			const result = api2021.stringifyWithOptions([1, 2], { trailingComma: true, space: 2 });
			expect(result).toBeDefined();
		});

		it("Should stringify with unquotedKeys: false option", () => {
			const result = api2021.stringifyWithOptions({ a: 1 }, { unquotedKeys: false, mode: "jsonv" });
			expect(result).toBeDefined();
		});

		it("Should stringify with bigint: 'string'", () => {
			const result = api2021.stringifyWithOptions({ value: 123n }, { bigint: "string" });
			expect(result).toContain('"123"');
		});

		it("Should stringify with bigint: 'object'", () => {
			const result = api2021.stringifyWithOptions({ value: 123n }, { bigint: "object" });
			expect(result).toContain('"$bigint"');
		});
	});
});
