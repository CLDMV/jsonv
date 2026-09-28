/**
 * Comprehensive tests for strictBigInt and strictOctal options
 * Tests both enabled and disabled states
 */

import { describe, it, expect } from "vitest";
import { parseWithOptions } from "../src/index.mjs";

describe("strictBigInt option", () => {
	describe("when enabled (strictBigInt: true)", () => {
		it("should throw for integers outside safe range without 'n' suffix", () => {
			expect(() => parseWithOptions("9007199254740993", { strictBigInt: true })).toThrow(/outside safe integer range/);
			expect(() => parseWithOptions("-9007199254740993", { strictBigInt: true })).toThrow(/outside safe integer range/);
		});

		it("should accept integers outside safe range with 'n' suffix", () => {
			const result = parseWithOptions("9007199254740993n", { strictBigInt: true, year: 2020 });
			expect(result).toBe(9007199254740993n);
		});

		it("should accept integers within safe range without 'n' suffix", () => {
			const result = parseWithOptions("9007199254740991", { strictBigInt: true });
			expect(result).toBe(9007199254740991);
		});

		it("should accept floats outside safe integer range", () => {
			const result = parseWithOptions("9007199254740993.5", { strictBigInt: true });
			expect(result).toBe(9007199254740993.5);
		});

		it("should accept special values (Infinity, NaN)", () => {
			expect(parseWithOptions("Infinity", { strictBigInt: true })).toBe(Infinity);
			expect(parseWithOptions("NaN", { strictBigInt: true })).toBeNaN();
		});

		it("should validate hex integers outside safe range", () => {
			// 0x1FFFFFFFFFFFFF = 9007199254740991 (safe)
			const safe = parseWithOptions("0x1FFFFFFFFFFFFF", { strictBigInt: true });
			expect(safe).toBe(9007199254740991);

			// 0x20000000000000 = 9007199254740992 (unsafe)
			expect(() => parseWithOptions("0x20000000000000", { strictBigInt: true })).toThrow(/outside safe integer range/);
		});

		it("should validate binary integers outside safe range", () => {
			// Binary number exceeding safe range
			expect(() =>
				parseWithOptions("0b100000000000000000000000000000000000000000000000000000", { strictBigInt: true, year: 2015 })
			).toThrow(/outside safe integer range/);
		});

		it("should validate octal integers outside safe range", () => {
			// Octal number exceeding safe range
			expect(() => parseWithOptions("0o400000000000000000", { strictBigInt: true, year: 2015 })).toThrow(/outside safe integer range/);
		});
	});

	describe("when disabled (strictBigInt: false) [DEFAULT]", () => {
		it("should accept integers outside safe range without 'n' suffix (converts to BigInt)", () => {
			// Note: Parser automatically converts unsafe integers to BigInt for safety
			const result = parseWithOptions("9007199254740993", { strictBigInt: false, year: 2020 });
			expect(result).toBe(9007199254740993n);
		});

		it("should accept negative integers outside safe range (converts to BigInt)", () => {
			const result = parseWithOptions("-9007199254740993", { strictBigInt: false, year: 2020 });
			expect(result).toBe(-9007199254740993n);
		});

		it("should still accept BigInt literals with 'n' suffix", () => {
			const result = parseWithOptions("9007199254740993n", { strictBigInt: false, year: 2020 });
			expect(result).toBe(9007199254740993n);
		});

		it("should accept hex integers outside safe range (converts to BigInt)", () => {
			const result = parseWithOptions("0x20000000000000", { strictBigInt: false, year: 2020 });
			expect(result).toBe(9007199254740992n);
		});

		it("defaults to false when not specified (auto-converts unsafe integers)", () => {
			const result = parseWithOptions("9007199254740993", { year: 2020 });
			expect(result).toBe(9007199254740993n);
		});
	});
});

describe("strictOctal option", () => {
	describe("when enabled (strictOctal: true)", () => {
		it("should reject legacy octal syntax (0755)", () => {
			expect(() => parseWithOptions("0755", { strictOctal: true })).toThrow(/legacy octal.*require.*0o prefix/i);
		});

		it("should accept modern octal syntax (0o755)", () => {
			const result = parseWithOptions("0o755", { strictOctal: true, year: 2015 });
			expect(result).toBe(493); // 0o755 = 493 decimal
		});

		it("should reject legacy octal in objects", () => {
			expect(() => parseWithOptions("{ perms: 0755 }", { strictOctal: true })).toThrow(/legacy octal.*require.*0o prefix/i);
		});

		it("should reject legacy octal in arrays", () => {
			expect(() => parseWithOptions("[0644, 0755]", { strictOctal: true })).toThrow(/legacy octal.*require.*0o prefix/i);
		});

		it("should accept regular decimal numbers starting with 0", () => {
			const result = parseWithOptions("0.755", { strictOctal: true });
			expect(result).toBe(0.755);
		});

		it("should accept zero", () => {
			const result = parseWithOptions("0", { strictOctal: true });
			expect(result).toBe(0);
		});
	});

	describe("when disabled (strictOctal: false) [DEFAULT]", () => {
		it("should accept legacy octal syntax (0755)", () => {
			const result = parseWithOptions("0755", { strictOctal: false });
			expect(result).toBe(493); // 0755 = 493 decimal
		});

		it("should accept modern octal syntax (0o755)", () => {
			const result = parseWithOptions("0o755", { strictOctal: false, year: 2015 });
			expect(result).toBe(493);
		});

		it("should accept legacy octal in objects", () => {
			const result = parseWithOptions("{ perms: 0644 }", { strictOctal: false });
			expect(result).toEqual({ perms: 420 }); // 0644 = 420 decimal
		});

		it("should accept legacy octal in arrays", () => {
			const result = parseWithOptions("[0755, 0644]", { strictOctal: false });
			expect(result).toEqual([493, 420]);
		});

		it("defaults to false when not specified", () => {
			const result = parseWithOptions("0755");
			expect(result).toBe(493);
		});
	});
});

describe("strictBigInt and strictOctal combined", () => {
	it("should work with both options enabled", () => {
		expect(() => parseWithOptions("0755", { strictBigInt: true, strictOctal: true })).toThrow(/legacy octal/i);
		expect(() => parseWithOptions("9007199254740993", { strictBigInt: true, strictOctal: true })).toThrow(/safe integer range/i);
	});

	it("should work with both options disabled (auto-converts unsafe integers)", () => {
		const result1 = parseWithOptions("0755", { strictBigInt: false, strictOctal: false });
		expect(result1).toBe(493);

		const result2 = parseWithOptions("9007199254740993", { strictBigInt: false, strictOctal: false, year: 2020 });
		expect(result2).toBe(9007199254740993n);
	});

	it("should work with strictBigInt enabled, strictOctal disabled", () => {
		const result = parseWithOptions("0755", { strictBigInt: true, strictOctal: false });
		expect(result).toBe(493);

		expect(() => parseWithOptions("9007199254740993", { strictBigInt: true, strictOctal: false })).toThrow(/safe integer range/i);
	});

	it("should work with strictOctal enabled, strictBigInt disabled (auto-converts)", () => {
		expect(() => parseWithOptions("0755", { strictBigInt: false, strictOctal: true })).toThrow(/legacy octal/i);

		const result = parseWithOptions("9007199254740993", { strictBigInt: false, strictOctal: true, year: 2020 });
		expect(result).toBe(9007199254740993n);
	});

	it("should handle complex objects with both validations", () => {
		const input = `{
			port: 8080,
			perms: 0o755,
			maxSize: 9007199254740991
		}`;

		const result = parseWithOptions(input, {
			strictBigInt: true,
			strictOctal: true,
			year: 2015
		});

		expect(result).toEqual({
			port: 8080,
			perms: 493,
			maxSize: 9007199254740991
		});
	});
});
