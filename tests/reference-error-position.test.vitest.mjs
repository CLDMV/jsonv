/**
 * Tests for GitHub issue #32: reference-resolution failures (unresolved and
 * circular internal references) must carry structured position information
 * (line/column/offset) plus a dedicated, detectable error class -- the same
 * treatment issue #28/#31 gave lexer/parser syntax errors, extended to the
 * reference-resolution error thrown by the parser's reference resolver.
 */

import { describe, test, expect } from "vitest";
import { parse, parseWithOptions, JsonvReferenceError } from "../src/index.mjs";
import { JsonvReferenceError as JsonvReferenceErrorFromParser } from "../src/parser.mjs";

describe("JsonvReferenceError (issue #32)", () => {
	describe("exported class", () => {
		test("is exported from the main entry point", () => {
			expect(JsonvReferenceError).toBeTypeOf("function");
		});

		test("is exported from the parser subpath and is the same class", () => {
			expect(JsonvReferenceErrorFromParser).toBe(JsonvReferenceError);
		});

		test("extends ReferenceError", () => {
			const err = new JsonvReferenceError("boom", { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } });
			expect(err).toBeInstanceOf(ReferenceError);
			expect(err).toBeInstanceOf(Error);
		});
	});

	describe("unresolved top-level reference", () => {
		// Input: "  x" -> `x` starts at 1-based line 1, 0-based column 2, offset 2.
		const input = "  x";

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input, { mode: "jsonv", year: 2025 })).toThrow(
				"Unresolved reference: x (circular reference or undefined)"
			);
		});

		test("is a JsonvReferenceError with name 'ReferenceError'", () => {
			try {
				parseWithOptions(input, { mode: "jsonv", year: 2025 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err).toBeInstanceOf(ReferenceError);
				expect(err.name).toBe("ReferenceError");
			}
		});

		test("exposes line/column/offset pointing at the reference", () => {
			try {
				parseWithOptions(input, { mode: "jsonv", year: 2025 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err.line).toBe(1);
				expect(err.column).toBe(input.indexOf("x"));
				expect(err.offset).toBe(input.indexOf("x"));
			}
		});

		test("exposes a distinct machine-readable code", () => {
			try {
				parseWithOptions(input, { mode: "jsonv", year: 2025 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(typeof err.code).toBe("string");
				expect(err.code).not.toBe("SYNTAX_ERROR");
				expect(err.code).not.toBe("PARSE_ERROR");
			}
		});

		test("exposes a loc matching line/column/offset", () => {
			try {
				parseWithOptions(input, { mode: "jsonv", year: 2025 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err.loc).toBeDefined();
				expect(err.loc.start.line).toBe(err.line);
				expect(err.loc.start.column).toBe(err.column);
				expect(err.loc.start.offset).toBe(err.offset);
			}
		});

		test("parse() (JSON.parse-compatible entry point) also throws JsonvReferenceError", () => {
			try {
				parse(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.line).toBe(1);
				expect(err.column).toBe(input.indexOf("x"));
				expect(err.offset).toBe(input.indexOf("x"));
			}
		});
	});

	describe("unresolved reference nested inside an object", () => {
		// line 1: {
		// line 2:   a: missingRef
		// line 3: }
		const input = "{\n  a: missingRef\n}";

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Unresolved reference: missingRef (circular reference or undefined)");
		});

		test("points at the reference's own position, not the object's", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.line).toBe(2);
				expect(err.column).toBe(input.split("\n")[1].indexOf("missingRef"));
			}
		});
	});

	describe("unresolved reference nested inside an array", () => {
		// line 1: [
		// line 2:   1,
		// line 3:   missingRef
		// line 4: ]
		const input = "[\n  1,\n  missingRef\n]";

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Unresolved reference: missingRef (circular reference or undefined)");
		});

		test("points at the reference's own position", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.line).toBe(3);
				expect(err.column).toBe(input.split("\n")[2].indexOf("missingRef"));
			}
		});
	});

	describe("circular reference", () => {
		// line 1: {
		// line 2:   a: b,
		// line 3:   b: a
		// line 4: }
		const input = "{\n  a: b,\n  b: a\n}";

		// Issue #54: a cycle is reported by name instead of as an unresolved reference
		test("names the cycle", () => {
			expect(() => parse(input)).toThrow("Circular reference: a -> b -> a");
		});

		test("is a JsonvReferenceError positioned at the reference that closes the cycle", () => {
			try {
				parse(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.code).toBe("UNRESOLVED_REFERENCE");
				expect(err.line).toBe(3);
				expect(err.column).toBe(input.split("\n")[2].indexOf("a"));
				expect(err.offset).toBe(input.lastIndexOf("a"));
			}
		});
	});

	describe("unresolved reference inside a template literal", () => {
		// `Value: ${missing}` -- the marker's node is the whole TemplateLiteral,
		// so the position points at the start of the template, not the
		// interpolated identifier itself.
		const input = "`Value: ${missing}`";

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow(/Unresolved reference.*template.*circular reference or undefined/i);
		});

		test("is a JsonvReferenceError with a position at the template literal", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.line).toBe(1);
				expect(err.column).toBe(0);
				expect(err.offset).toBe(0);
			}
		});
	});

	describe("multi-line input", () => {
		const input = ["{", "  first: 1,", "  second: 2,", "  third: notDefined,", "  fourth: 4", "}"].join("\n");

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Unresolved reference: notDefined (circular reference or undefined)");
		});

		test("points at line 4 where the reference appears", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvReferenceError);
				expect(err.line).toBe(4);
				expect(err.column).toBe("  third: ".length);
				expect(err.offset).toBe(input.split("\n").slice(0, 3).join("\n").length + 1 + "  third: ".length);
			}
		});
	});
});
