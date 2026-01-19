/**
 * Comprehensive JSON5 spec compliance tests
 * Based on https://spec.json5.org/
 *
 * This test file verifies all features mentioned in the JSON5 specification
 */

import { describe, test, expect } from "vitest";
import JSONV from "../src/index.mjs";

describe("JSON5 Spec Compliance", () => {
	describe("1.1 Summary of Features - Objects", () => {
		test("Object keys may be ECMAScript 5.1 IdentifierName", () => {
			const result = JSONV.parse("{ unquoted: true, $dollar: 1, _underscore: 2 }");
			expect(result).toEqual({ unquoted: true, $dollar: 1, _underscore: 2 });
		});

		test("Objects may have a single trailing comma", () => {
			const result = JSONV.parse("{ a: 1, b: 2, }");
			expect(result).toEqual({ a: 1, b: 2 });
		});
	});

	describe("1.1 Summary of Features - Arrays", () => {
		test("Arrays may have a single trailing comma", () => {
			const result = JSONV.parse("[1, 2, 3,]");
			expect(result).toEqual([1, 2, 3]);
		});
	});

	describe("1.1 Summary of Features - Strings", () => {
		test("Strings may be single quoted", () => {
			const result = JSONV.parse("{ key: 'value' }");
			expect(result).toEqual({ key: "value" });
		});

		test("Strings may span multiple lines by escaping new line characters", () => {
			const result = JSONV.parse("'line one\\\nline two'");
			expect(result).toBe("line oneline two");
		});

		test("Strings may include character escapes", () => {
			const result = JSONV.parse("'\\n\\t\\r\\b\\f\\v\\\\'");
			expect(result).toBe("\n\t\r\b\f\v\\");
		});
	});

	describe("1.1 Summary of Features - Numbers", () => {
		test("Numbers may be hexadecimal", () => {
			const result = JSONV.parse("{ hex: 0xdecaf }");
			expect(result.hex).toBe(0xdecaf);
		});

		test("Numbers may have a leading decimal point", () => {
			const result = JSONV.parse(".8675309");
			expect(result).toBe(0.8675309);
		});

		test("Numbers may have a trailing decimal point", () => {
			const result = JSONV.parse("8675309.");
			expect(result).toBe(8675309);
		});

		test("Numbers may be IEEE 754 positive infinity", () => {
			const result = JSONV.parse("Infinity");
			expect(result).toBe(Infinity);
		});

		test("Numbers may be IEEE 754 negative infinity", () => {
			const result = JSONV.parse("-Infinity");
			expect(result).toBe(-Infinity);
		});

		test("Numbers may be NaN", () => {
			const result = JSONV.parse("NaN");
			expect(Number.isNaN(result)).toBe(true);
		});

		test("Numbers may begin with an explicit plus sign", () => {
			const result = JSONV.parse("+1");
			expect(result).toBe(1);
		});
	});

	describe("1.1 Summary of Features - Comments", () => {
		test("Single line comments are allowed", () => {
			const result = JSONV.parse("{ // comment\n key: 'value' }");
			expect(result).toEqual({ key: "value" });
		});

		test("Multi-line comments are allowed", () => {
			const result = JSONV.parse("{ /* comment */ key: 'value' }");
			expect(result).toEqual({ key: "value" });
		});
	});

	describe("1.2 Short Example - Kitchen Sink", () => {
		test("should parse the JSON5 kitchen sink example", () => {
			const kitchenSink = `{
				// comments
				unquoted: 'and you can quote me on that',
				singleQuotes: 'I can use "double quotes" here',
				lineBreaks: "Look, Mom! \\
No \\\\n's!",
				hexadecimal: 0xdecaf,
				leadingDecimalPoint: .8675309,
				andTrailing: 8675309.,
				positiveSign: +1,
				trailingComma: 'in objects',
				andIn: ['arrays',],
				"backwardsCompatible": "with JSON",
			}`;

			const result = JSONV.parse(kitchenSink);
			expect(result).toEqual({
				unquoted: "and you can quote me on that",
				singleQuotes: 'I can use "double quotes" here',
				lineBreaks: "Look, Mom! No \\n's!",
				hexadecimal: 0xdecaf,
				leadingDecimalPoint: 0.8675309,
				andTrailing: 8675309,
				positiveSign: 1,
				trailingComma: "in objects",
				andIn: ["arrays"],
				backwardsCompatible: "with JSON"
			});
		});
	});

	describe("3 Objects - Examples", () => {
		test("Empty object", () => {
			const result = JSONV.parse("{}");
			expect(result).toEqual({});
		});

		test("Object with two properties and trailing comma", () => {
			const result = JSONV.parse("{ width: 1920, height: 1080, }");
			expect(result).toEqual({ width: 1920, height: 1080 });
		});

		test("Nested objects", () => {
			const result = JSONV.parse(`{
				image: {
					width: 1920,
					height: 1080,
					'aspect-ratio': '16:9',
				}
			}`);
			expect(result).toEqual({
				image: {
					width: 1920,
					height: 1080,
					"aspect-ratio": "16:9"
				}
			});
		});

		test("Array of objects", () => {
			const result = JSONV.parse(`[
				{ name: 'Joe', age: 27 },
				{ name: 'Jane', age: 32 },
			]`);
			expect(result).toEqual([
				{ name: "Joe", age: 27 },
				{ name: "Jane", age: 32 }
			]);
		});
	});

	describe("4 Arrays - Examples", () => {
		test("Empty array", () => {
			const result = JSONV.parse("[]");
			expect(result).toEqual([]);
		});

		test("Array with three elements and trailing comma", () => {
			const result = JSONV.parse("[1, true, 'three',]");
			expect(result).toEqual([1, true, "three"]);
		});

		test("Nested arrays", () => {
			const result = JSONV.parse(`[
				[1, true, 'three'],
				[4, "five", 0x6],
			]`);
			expect(result).toEqual([
				[1, true, "three"],
				[4, "five", 6]
			]);
		});
	});

	describe("5.1 Escapes - Table 1", () => {
		test("Apostrophe escape", () => {
			expect(JSONV.parse("'\\''")).toBe("'");
		});

		test("Quotation mark escape", () => {
			expect(JSONV.parse('"\\""')).toBe('"');
		});

		test("Reverse solidus escape", () => {
			expect(JSONV.parse("'\\\\'")).toBe("\\");
		});

		test("Backspace escape", () => {
			expect(JSONV.parse("'\\b'")).toBe("\b");
		});

		test("Form feed escape", () => {
			expect(JSONV.parse("'\\f'")).toBe("\f");
		});

		test("Line feed escape", () => {
			expect(JSONV.parse("'\\n'")).toBe("\n");
		});

		test("Carriage return escape", () => {
			expect(JSONV.parse("'\\r'")).toBe("\r");
		});

		test("Horizontal tab escape", () => {
			expect(JSONV.parse("'\\t'")).toBe("\t");
		});

		test("Vertical tab escape", () => {
			expect(JSONV.parse("'\\v'")).toBe("\v");
		});

		test("Null escape", () => {
			expect(JSONV.parse("'\\0'")).toBe("\0");
		});
	});

	describe("5.1 Escapes - Hex escapes", () => {
		test("\\x5C represents single reverse solidus", () => {
			expect(JSONV.parse("'\\x5C'")).toBe("\\");
		});

		test("\\u005C represents single reverse solidus", () => {
			expect(JSONV.parse("'\\u005C'")).toBe("\\");
		});
	});

	describe("5.1 Escapes - Line continuation", () => {
		test("Line feed continuation", () => {
			const result = JSONV.parse("'Lorem ipsum dolor sit amet, \\\nconsectetur adipiscing elit.'");
			expect(result).toBe("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
		});

		test("Carriage return continuation", () => {
			const result = JSONV.parse("'Lorem ipsum dolor sit amet, \\\rconsectetur adipiscing elit.'");
			expect(result).toBe("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
		});

		test("CRLF continuation", () => {
			const result = JSONV.parse("'Lorem ipsum dolor sit amet, \\\r\nconsectetur adipiscing elit.'");
			expect(result).toBe("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
		});
	});

	describe("5.1 Escapes - Invalid escapes become the character", () => {
		test("Invalid escapes (Example 5)", () => {
			expect(JSONV.parse("'\\A\\C\\/\\D\\C'")).toBe("AC/DC");
		});
	});

	describe("6 Numbers - Examples", () => {
		test("Integer", () => {
			const result = JSONV.parse("{ integer: 123 }");
			expect(result.integer).toBe(123);
		});

		test("With fraction part", () => {
			const result = JSONV.parse("{ withFractionPart: 123.456 }");
			expect(result.withFractionPart).toBe(123.456);
		});

		test("Only fraction part", () => {
			const result = JSONV.parse("{ onlyFractionPart: .456 }");
			expect(result.onlyFractionPart).toBe(0.456);
		});

		test("With exponent", () => {
			const result = JSONV.parse("{ withExponent: 123e-456 }");
			expect(result.withExponent).toBe(123e-456);
		});

		test("Positive hexadecimal", () => {
			const result = JSONV.parse("{ positiveHex: 0xdecaf }");
			expect(result.positiveHex).toBe(0xdecaf);
		});

		test("Negative hexadecimal", () => {
			const result = JSONV.parse("{ negativeHex: -0xC0FFEE }");
			expect(result.negativeHex).toBe(-0xc0ffee);
		});

		test("Positive infinity", () => {
			const result = JSONV.parse("{ positiveInfinity: Infinity }");
			expect(result.positiveInfinity).toBe(Infinity);
		});

		test("Negative infinity", () => {
			const result = JSONV.parse("{ negativeInfinity: -Infinity }");
			expect(result.negativeInfinity).toBe(-Infinity);
		});

		test("Not a number", () => {
			const result = JSONV.parse("{ notANumber: NaN }");
			expect(Number.isNaN(result.notANumber)).toBe(true);
		});
	});

	describe("8 White Space - Table 3", () => {
		test("Should handle various whitespace characters", () => {
			// Test with horizontal tab, line feed, vertical tab, form feed, carriage return, space
			const result = JSONV.parse("{\t\n\v\f\r key:\t\n\v\f\r 'value'\t\n\v\f\r }");
			expect(result).toEqual({ key: "value" });
		});

		test("Should handle non-breaking space (U+00A0)", () => {
			const result = JSONV.parse("{ key:\u00A0'value' }");
			expect(result).toEqual({ key: "value" });
		});
	});

	describe("Unicode Support - Emojis", () => {
		test("Should support emojis in string values", () => {
			const result = JSONV.parse('{ emoji: "🚀", heart: "❤️", party: "🎉" }');
			expect(result).toEqual({ emoji: "🚀", heart: "❤️", party: "🎉" });
		});

		test("Should support emojis in object keys", () => {
			const result = JSONV.parse('{ "🔑": "key", "🎯": "target" }');
			expect(result).toEqual({ "🔑": "key", "🎯": "target" });
		});

		test("Should support emojis in arrays", () => {
			const result = JSONV.parse('["🍎", "🍊", "🍋", "🍌"]');
			expect(result).toEqual(["🍎", "🍊", "🍋", "🍌"]);
		});

		test("Should round-trip emojis through stringify", () => {
			const original = { message: "Hello 👋 World 🌍!" };
			const text = JSONV.stringify(original);
			const parsed = JSONV.parse(text);
			expect(parsed).toEqual(original);
		});
	});
});
