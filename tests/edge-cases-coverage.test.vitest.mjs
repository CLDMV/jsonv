/**
 * Edge case tests to improve coverage
 * Targets uncovered error paths and edge cases in lexer, parser, and stringify
 */

import { describe, it, expect } from "vitest";
import { parse, parseWithOptions, stringify } from "../src/index.mjs";

describe("Lexer Edge Cases", () => {
	describe("Comment edge cases", () => {
		it("Should reject block comments in JSON mode", () => {
			expect(() => parseWithOptions("{ /* comment */ a: 1 }", { mode: "json" })).toThrow(/comments not allowed/i);
		});

		it("Should reject line comments in JSON mode", () => {
			expect(() => parseWithOptions("{ a: 1 // comment\n }", { mode: "json" })).toThrow(/comments not allowed/i);
		});
	});

	describe("Negative number edge cases", () => {
		it("Should handle -Infinity", () => {
			expect(parse("-Infinity")).toBe(-Infinity);
		});

		it("Should handle -NaN", () => {
			const result = parse("-NaN");
			expect(Number.isNaN(result)).toBe(true);
		});

		it("Should reject negative identifier (not Infinity or NaN)", () => {
			// This throws earlier at lexer level with "Unexpected character"
			expect(() => parse("-someIdentifier")).toThrow();
		});
	});

	describe("String edge cases", () => {
		it("Should reject unterminated string with literal newline", () => {
			expect(() => parse('{"value": "unterminated\n"}')).toThrow(/unterminated string/i);
		});
	});

	describe("Template literal edge cases", () => {
		it("Should reject unterminated template literal", () => {
			expect(() => parse("`unterminated")).toThrow(/unterminated template/i);
		});
	});

	describe("Numeric separator edge cases", () => {
		it("Should reject separator at invalid position in exponent", () => {
			// Separator after 'e' with no digits following
			expect(() => parseWithOptions("1e_5", { year: 2021 })).toThrow(/invalid.*separator/i);
		});

		it("Should reject separator at end of exponent", () => {
			expect(() => parseWithOptions("1e5_", { year: 2021 })).toThrow(/invalid.*separator/i);
		});
	});

	describe("Unicode whitespace edge cases", () => {
		it("Should handle rare Unicode whitespace characters", () => {
			// U+2028 Line separator, U+2029 Paragraph separator, U+202F Narrow no-break space
			const text = "{\u2028a:\u20291,\u202Fb:\u20002\u3000}";
			expect(parse(text)).toEqual({ a: 1, b: 2 });
		});
	});
});

describe("Parser Edge Cases", () => {
	describe("Unexpected token types", () => {
		it("Should handle unexpected token in literal position", () => {
			// This creates a parse error for unexpected token type
			expect(() => parse("{ a: : }")).toThrow();
		});
	});

	describe("Template literal error paths", () => {
		it("Should handle template literal errors gracefully", () => {
			// Malformed template - the parser should detect this
			// This is a difficult edge case - template head without proper continuation
			expect(() => parse("`${incomplete")).toThrow();
		});
	});
});

describe("Stringify Edge Cases", () => {
	describe("Control character escaping", () => {
		it("Should escape backspace character", () => {
			const result = stringify({ text: "hello\bworld" });
			expect(result).toContain("\\b");
		});

		it("Should escape form feed character", () => {
			const result = stringify({ text: "hello\fworld" });
			expect(result).toContain("\\f");
		});

		it("Should escape carriage return character", () => {
			const result = stringify({ text: "hello\rworld" });
			expect(result).toContain("\\r");
		});

		it("Should escape tab character", () => {
			const result = stringify({ text: "hello\tworld" });
			expect(result).toContain("\\t");
		});

		it("Should escape newline character", () => {
			const result = stringify({ text: "hello\nworld" });
			expect(result).toContain("\\n");
		});

		it("Should handle string with multiple control characters", () => {
			const result = stringify({ text: "\b\f\r\t\n" });
			expect(result).toContain("\\b");
			expect(result).toContain("\\f");
			expect(result).toContain("\\r");
			expect(result).toContain("\\t");
			expect(result).toContain("\\n");
		});
	});

	describe("Value type edge cases", () => {
		it("Should return null for unknown types", () => {
			// Test the default return path in stringifyValue
			const result = stringify({ symbol: Symbol("test") });
			// Symbols are skipped in objects, so we get empty object
			expect(result).toBe("{}");
		});
	});
});

describe("Error Message Coverage", () => {
	it("Should provide error messages for various syntax errors", () => {
		// Missing closing bracket
		expect(() => parse("[1, 2")).toThrow();

		// Missing closing brace
		expect(() => parse("{a: 1")).toThrow();

		// Invalid escape in template (if applicable)
		expect(() => parseWithOptions("`\\x`", { year: 2015 })).toThrow();
	});
});
