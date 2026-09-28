/**
 * Tests for GitHub issue #28: parse errors must carry structured position
 * information (line/column/offset) plus a dedicated, detectable error class,
 * not just position text baked into the message.
 */

import { describe, test, expect } from "vitest";
import { parse, parseWithOptions, JsonvSyntaxError } from "../src/index.mjs";
import { JsonvSyntaxError as JsonvSyntaxErrorFromParser } from "../src/parser.mjs";
import { Lexer } from "../src/lexer/lexer.mjs";
import { LexerError } from "../src/lexer/lexer-types.mjs";

describe("JsonvSyntaxError (issue #28)", () => {
	describe("exported class", () => {
		test("is exported from the main entry point", () => {
			expect(JsonvSyntaxError).toBeTypeOf("function");
		});

		test("is exported from the parser subpath and is the same class", () => {
			expect(JsonvSyntaxErrorFromParser).toBe(JsonvSyntaxError);
		});

		test("extends SyntaxError", () => {
			const err = new JsonvSyntaxError("boom", { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } });
			expect(err).toBeInstanceOf(SyntaxError);
			expect(err).toBeInstanceOf(Error);
		});
	});

	describe("parser-level error (unexpected token)", () => {
		// Input:
		// [\n\n\n  1,\n  }
		// line 1: [
		// line 2: (blank)
		// line 3: (blank)
		// line 4:   1,
		// line 5:   }   <- unexpected RBRACE at 0-based column 2, offset 11
		const input = "[\n\n\n  1,\n  }";

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Unexpected token: RBRACE at line 5, column 2");
		});

		test("is a JsonvSyntaxError with name 'SyntaxError'", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err).toBeInstanceOf(SyntaxError);
				expect(err.name).toBe("SyntaxError");
			}
		});

		test("exposes line/column/offset matching the message", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err.line).toBe(5);
				expect(err.column).toBe(2);
				expect(err.offset).toBe(input.indexOf("}"));
			}
		});

		test("parse() (JSON.parse-compatible entry point) also throws JsonvSyntaxError", () => {
			try {
				parse(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.line).toBe(5);
				expect(err.column).toBe(2);
				expect(err.offset).toBe(input.indexOf("}"));
			}
		});
	});

	describe("lexer-level error (unterminated string)", () => {
		const input = '"unterminated';

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Unterminated string");
		});

		test("is a JsonvSyntaxError (via LexerError) reaching the public entry point", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err).toBeInstanceOf(LexerError);
				expect(err).toBeInstanceOf(SyntaxError);
			}
		});

		test("exposes line/column/offset for the end-of-input position", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err.line).toBe(1);
				expect(err.column).toBe(input.length);
				expect(err.offset).toBe(input.length);
			}
		});
	});

	describe("lexer-level error (invalid escape sequence)", () => {
		// `"\u12"` -> backslash, u, 1, 2, then closing quote instead of 2 more hex digits
		const input = '"\\u12"';

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input)).toThrow("Invalid unicode escape sequence");
		});

		test("is a JsonvSyntaxError with structured position", () => {
			try {
				parseWithOptions(input);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.code).toBe("INVALID_UNICODE_ESCAPE");
				expect(typeof err.line).toBe("number");
				expect(typeof err.column).toBe("number");
				expect(typeof err.offset).toBe("number");
			}
		});
	});

	describe("year-gated feature error (lexer-level)", () => {
		const input = "0b1010"; // binary literal, not allowed before ES2015

		test("keeps the existing message text unchanged", () => {
			expect(() => parseWithOptions(input, { year: 2011 })).toThrow("Binary literals not allowed in this year");
		});

		test("is a JsonvSyntaxError with structured position", () => {
			try {
				parseWithOptions(input, { year: 2011 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.line).toBe(1);
				expect(err.column).toBe(0);
				expect(err.offset).toBe(0);
			}
		});
	});

	describe("strict option error (strictOctal, lexer-level)", () => {
		const input = "0755"; // legacy octal without 0o prefix

		test("is a JsonvSyntaxError with structured position", () => {
			try {
				parseWithOptions(input, { strictOctal: true });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.code).toBe("INVALID_OCTAL");
				expect(err.line).toBe(1);
				expect(err.offset).toBe(0);
			}
		});
	});

	describe("strict option error (strictBigInt, parser-level)", () => {
		const input = "9007199254740993";

		test("is a JsonvSyntaxError with structured position", () => {
			try {
				parseWithOptions(input, { strictBigInt: true });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.code).toBe("PARSE_ERROR");
				expect(err.line).toBe(1);
				expect(err.column).toBe(0);
				expect(err.offset).toBe(0);
			}
		});
	});

	describe("tolerant mode", () => {
		test("a parser-level (collected) error in tolerant mode throws the aggregate JsonvSyntaxError (issue #59)", () => {
			// Tolerant parses used to evaluate the partial document and return a
			// value; since #59 the collected errors are thrown as one aggregate.
			try {
				parseWithOptions("[1, }", { tolerant: true });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.errors).toHaveLength(1);
				expect(err.line).toBe(1);
				expect(err.column).toBe(4);
				expect(err.offset).toBe(4);
			}
		});

		test("a lexer-level error reaching a tolerant parse is still a JsonvSyntaxError", () => {
			// Lexer errors are thrown eagerly during tokenization, before the
			// parser's tolerant error-collection loop ever runs, so tolerant
			// mode does not suppress them (pre-existing behavior) -- but the
			// error itself must still be the new structured class.
			try {
				parseWithOptions('"unterminated', { tolerant: true });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(typeof err.line).toBe("number");
				expect(typeof err.column).toBe("number");
				expect(typeof err.offset).toBe("number");
			}
		});
	});

	describe("direct lexer usage is unaffected", () => {
		test("Lexer.tokenize() still throws a LexerError with .loc and .code (existing contract)", () => {
			const lexer = new Lexer('"unterminated');
			try {
				lexer.tokenize();
				expect.fail("should have thrown");
			} catch (err) {
				expect(err.name).toBe("LexerError");
				expect(err.message).toContain("Unterminated string");
				expect(err.loc).toBeDefined();
				expect(err.loc.start.line).toBe(1);
				expect(err.code).toBeDefined();
				// New: also a JsonvSyntaxError, with the same structured fields.
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect(err.line).toBe(err.loc.start.line);
				expect(err.column).toBe(err.loc.start.column);
				expect(err.offset).toBe(err.loc.start.offset);
			}
		});
	});
});
