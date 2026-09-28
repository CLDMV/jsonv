/**
 * Lexer edge case tests - targeting remaining uncovered lines
 */

import { describe, it, expect } from "vitest";
import { parse } from "../src/index.mjs";
import { parse as parse2011 } from "../src/years/2011.mjs";
import { parse as parse2015 } from "../src/years/2015.mjs";
import { parse as parse2021 } from "../src/years/2021.mjs";

describe("Lexer Edge Cases - Remaining Coverage", () => {
	describe("Escape sequence errors", () => {
		it("should handle EOF during escape sequence", () => {
			expect(() => parse('"test\\')).toThrow(/unterminated string/i);
		});

		it("should handle EOF during template escape", () => {
			expect(() => parse2015("`test\\")).toThrow(/template|escape|unterminated/i);
		});

		it("should handle unterminated template at EOF", () => {
			expect(() => parse2015("`test")).toThrow(/unterminated template/i);
		});
	});

	describe("Negative number identifier errors", () => {
		it("should reject negative identifier that isn't Infinity or NaN", () => {
			expect(() => parse("-someVariable")).toThrow();
		});

		it("should reject negative identifier in object", () => {
			expect(() => parse("{ x: -invalidId }")).toThrow();
		});
	});

	describe("Numeric separator edge cases", () => {
		it("should reject binary separator not followed by valid binary digit", () => {
			expect(() => parse2021("0b1_2")).toThrow(/separator/i);
		});

		it("should reject octal separator not followed by valid octal digit", () => {
			expect(() => parse2021("0o7_8")).toThrow(/separator/i);
		});

		it("should reject separator after decimal point", () => {
			// Note: "1._5" parses as identifier lookup (1 . _5), not separator error
			// Test an actual invalid separator position
			expect(() => parse2021("1.5_")).toThrow(/separator/i);
		});

		it("should reject separator not followed by digit in integer part", () => {
			expect(() => parse2021("123_")).toThrow(/separator/i);
		});
	});

	describe("Legacy octal - always allowed in jsonv", () => {
		it("should accept legacy octal (0755)", () => {
			const result = parse2011("0755");
			expect(result).toBe(493); // 0755 in octal = 493 in decimal
		});

		it("should accept new octal syntax (0o755)", () => {
			const result = parse2015("0o755");
			expect(result).toBe(493);
		});
	});

	describe("BigInt validation in decimal numbers", () => {
		it("should reject BigInt suffix in wrong year (2011) for decimal", () => {
			expect(() => parse2011("12345n")).toThrow(/bigint/i);
		});

		it("should reject BigInt suffix in wrong year (2015) for decimal", () => {
			expect(() => parse2015("67890n")).toThrow(/bigint/i);
		});
	});

	describe("Number format validation", () => {
		it("should reject empty binary literal", () => {
			expect(() => parse2015("0b")).toThrow(/binary/i);
		});

		it("should reject empty octal literal", () => {
			expect(() => parse2015("0o")).toThrow(/octal/i);
		});

		it("should reject exponent without digits", () => {
			expect(() => parse("1e")).toThrow(/exponent/i);
		});

		it("should reject exponent with just sign", () => {
			expect(() => parse("1e+")).toThrow(/exponent/i);
		});
	});

	describe("Hex literals - always allowed", () => {
		it("should accept hex in all years", () => {
			const result = parse2011("0xFF");
			expect(result).toBe(255);
		});
	});
});
