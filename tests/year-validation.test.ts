/**
 * Year-based feature validation tests
 * Tests that features are properly rejected when used in wrong year modules
 */

import { describe, it, expect } from "vitest";
import { parse as parse2011 } from "../src/years/2011.mjs";
import { parse as parse2015 } from "../src/years/2015.mjs";
import { parse as parse2020 } from "../src/years/2020.mjs";

describe("Year-based Feature Validation", () => {
	describe("Numeric Separators (ES2021) - should fail in earlier years", () => {
		it("should reject decimal separators in 2011", () => {
			expect(() => parse2011("1_000")).toThrow(/numeric separator/i);
		});

		it("should reject hex separators in 2011", () => {
			expect(() => parse2011("0xFF_AA")).toThrow(/numeric separator/i);
		});

		it("should reject binary separators in 2015", () => {
			expect(() => parse2015("0b1010_1111")).toThrow(/numeric separator/i);
		});

		it("should reject octal separators in 2015", () => {
			expect(() => parse2015("0o755_123")).toThrow(/numeric separator/i);
		});

		it("should reject separators in exponent in 2020", () => {
			expect(() => parse2020("1.5e1_0")).toThrow(/numeric separator/i);
		});

		it("should reject separators in decimal numbers in 2011", () => {
			expect(() => parse2011("3.141_592")).toThrow(/numeric separator/i);
		});
	});

	describe("BigInt (ES2020) - should fail in earlier years", () => {
		it("should reject BigInt in 2011", () => {
			expect(() => parse2011("9007199254740992n")).toThrow(/bigint/i);
		});

		it("should reject hex BigInt in 2011", () => {
			expect(() => parse2011("0xFFFFFFFFFFFFFFFFn")).toThrow(/bigint/i);
		});

		it("should reject binary BigInt in 2015", () => {
			expect(() => parse2015("0b11111111n")).toThrow(/bigint/i);
		});

		it("should reject octal BigInt in 2015", () => {
			expect(() => parse2015("0o777n")).toThrow(/bigint/i);
		});

		it("should reject legacy octal BigInt in 2011", () => {
			expect(() => parse2011("0755n")).toThrow(/bigint/i);
		});

		it("should reject BigInt with decimal point", () => {
			expect(() => parse2020("123.45n")).toThrow(/bigint.*decimal/i);
		});

		it("should reject BigInt with exponent", () => {
			expect(() => parse2020("123e10n")).toThrow(/bigint.*exponent/i);
		});
	});

	describe("Binary Literals (ES2015) - should fail in ES2011", () => {
		it("should reject binary in 2011", () => {
			expect(() => parse2011("0b1010")).toThrow();
		});

		it("should reject binary BigInt in 2011", () => {
			expect(() => parse2011("0b11111111n")).toThrow();
		});
	});

	describe("Octal Literals ES2015 syntax (0o) - should fail in ES2011", () => {
		it("should reject new octal syntax in 2011", () => {
			expect(() => parse2011("0o755")).toThrow();
		});

		it("should reject new octal BigInt in 2011", () => {
			expect(() => parse2011("0o777n")).toThrow();
		});
	});

	describe("Template Literals (ES2015) - should fail in ES2011", () => {
		it("should reject template literals in 2011", () => {
			expect(() => parse2011("`hello`")).toThrow();
		});

		it("should reject template interpolation in 2011", () => {
			expect(() => parse2011("{ x: 5, y: `value: ${x}` }")).toThrow();
		});
	});

	describe("Combined features - multiple year violations", () => {
		it("should reject BigInt with separators in 2015", () => {
			expect(() => parse2015("9_007_199_254_740_992n")).toThrow();
		});

		it("should reject hex BigInt with separators in 2015", () => {
			expect(() => parse2015("0xFF_FF_FF_FFn")).toThrow();
		});

		it("should reject binary BigInt with separators in 2011", () => {
			expect(() => parse2011("0b1111_0000n")).toThrow();
		});
	});
});
