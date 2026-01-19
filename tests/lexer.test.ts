/**
 * Unit tests for @cldmv/jsonv Lexer
 */

import { describe, test, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.mjs";
import { TokenType } from "../src/lexer/lexer-types.mjs";

describe("Lexer", () => {
	describe("Basic Tokenization", () => {
		test("tokenizes simple object", () => {
			const lexer = new Lexer('{ "key": "value" }');
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(6); // { String : String } EOF
			expect(tokens[0].type).toBe(TokenType.LBRACE);
			expect(tokens[1].type).toBe(TokenType.STRING);
			expect(tokens[1].value).toBe("key");
			expect(tokens[2].type).toBe(TokenType.COLON);
			expect(tokens[3].type).toBe(TokenType.STRING);
			expect(tokens[3].value).toBe("value");
			expect(tokens[4].type).toBe(TokenType.RBRACE);
			expect(tokens[5].type).toBe(TokenType.EOF);
		});

		test("tokenizes simple array", () => {
			const lexer = new Lexer("[1, 2, 3]");
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(8); // [ Number , Number , Number ] EOF
			expect(tokens[0].type).toBe(TokenType.LBRACKET);
			expect(tokens[1].type).toBe(TokenType.NUMBER);
			expect(tokens[1].value).toBe(1);
			expect(tokens[3].type).toBe(TokenType.NUMBER);
			expect(tokens[3].value).toBe(2);
			expect(tokens[5].type).toBe(TokenType.NUMBER);
			expect(tokens[5].value).toBe(3);
			expect(tokens[6].type).toBe(TokenType.RBRACKET);
		});

		test("handles trailing commas (JSON5)", () => {
			const lexer = new Lexer("[1, 2,]", { year: 2011 });
			const tokens = lexer.tokenize();

			// Should not error, trailing comma is JSON5 feature
			expect(tokens[5].type).toBe(TokenType.RBRACKET);
		});
	});

	describe("Keywords and Literals", () => {
		test("tokenizes boolean literals", () => {
			const lexer = new Lexer("true false");
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.TRUE);
			expect(tokens[0].value).toBe(true);
			expect(tokens[1].type).toBe(TokenType.FALSE);
			expect(tokens[1].value).toBe(false);
		});

		test("tokenizes null literal", () => {
			const lexer = new Lexer("null");
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.NULL);
			expect(tokens[0].value).toBe(null);
		});

		test("tokenizes Infinity and NaN (JSON5)", () => {
			const lexer = new Lexer("Infinity -Infinity NaN", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.INFINITY);
			expect(tokens[0].value).toBe(Infinity);
			expect(tokens[1].type).toBe(TokenType.NUMBER);
			expect(tokens[1].value).toBe(-Infinity);
			expect(tokens[2].type).toBe(TokenType.NAN);
			expect(Number.isNaN(tokens[2].value)).toBe(true);
		});
	});

	describe("String Tokenization", () => {
		test("tokenizes double-quoted strings", () => {
			const lexer = new Lexer('"hello world"');
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.STRING);
			expect(tokens[0].value).toBe("hello world");
			expect(tokens[0].raw).toBe('"hello world"');
		});

		test("tokenizes single-quoted strings (JSON5)", () => {
			const lexer = new Lexer("'hello world'", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.STRING);
			expect(tokens[0].value).toBe("hello world");
			expect(tokens[0].raw).toBe("'hello world'");
		});

		test("handles escape sequences", () => {
			const lexer = new Lexer('"\\n\\t\\r\\b\\f\\"\\\\"');
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe('\n\t\r\b\f"\\');
		});

		test("handles JSON5 escape sequences", () => {
			const lexer = new Lexer("'\\v\\0\\x41'", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe("\v\0A"); // \x41 is 'A'
		});

		test("handles unicode escape sequences", () => {
			const lexer = new Lexer('"\\u0048\\u0065\\u006C\\u006C\\u006F"');
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe("Hello");
		});

		test("handles line continuation (JSON5)", () => {
			const lexer = new Lexer("'hello \\\nworld'", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe("hello world");
		});

		test("throws on unterminated string", () => {
			const lexer = new Lexer('"unterminated');

			expect(() => lexer.tokenize()).toThrow("Unterminated string");
		});
	});

	describe("Number Tokenization", () => {
		test("tokenizes decimal integers", () => {
			const lexer = new Lexer("123 456 789");
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.NUMBER);
			expect(tokens[0].value).toBe(123);
			expect(tokens[1].value).toBe(456);
			expect(tokens[2].value).toBe(789);
		});

		test("tokenizes decimal floats", () => {
			const lexer = new Lexer("3.14 2.71828 0.5");
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(3.14);
			expect(tokens[1].value).toBe(2.71828);
			expect(tokens[2].value).toBe(0.5);
		});

		test("tokenizes leading/trailing decimal points (JSON5)", () => {
			const lexer = new Lexer(".5 5. 5.0", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0.5);
			expect(tokens[1].value).toBe(5);
			expect(tokens[2].value).toBe(5);
		});

		test("tokenizes scientific notation", () => {
			const lexer = new Lexer("1e10 2.5e-3 3E+5");
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(1e10);
			expect(tokens[1].value).toBe(2.5e-3);
			expect(tokens[2].value).toBe(3e5);
		});

		test("tokenizes positive sign (JSON5)", () => {
			const lexer = new Lexer("+5 +.5 +1e10", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(5);
			expect(tokens[1].value).toBe(0.5);
			expect(tokens[2].value).toBe(1e10);
		});

		test("tokenizes hex literals (JSON5)", () => {
			const lexer = new Lexer("0xFF 0xDEADBEEF 0x0", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.NUMBER);
			expect(tokens[0].value).toBe(0xff);
			expect(tokens[1].value).toBe(0xdeadbeef);
			expect(tokens[2].value).toBe(0);
		});

		test("tokenizes binary literals (ES2015)", () => {
			const lexer = new Lexer("0b1010 0b11110000", { year: 2015 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0b1010);
			expect(tokens[1].value).toBe(0b11110000);
		});

		test("tokenizes octal literals (ES2015)", () => {
			const lexer = new Lexer("0o755 0o644", { year: 2015 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0o755);
			expect(tokens[1].value).toBe(0o644);
		});

		test("tokenizes legacy octal literals (ES2015)", () => {
			const lexer = new Lexer("0755 0644", { year: 2015 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0o755);
			expect(tokens[1].value).toBe(0o644);
		});

		test("tokenizes BigInt literals (ES2020)", () => {
			const lexer = new Lexer("9007199254740992n", { year: 2020 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.BIGINT);
			expect(tokens[0].value).toBe(9007199254740992n);
		});

		test("tokenizes hex BigInt (ES2020)", () => {
			const lexer = new Lexer("0xFFFFFFFFFFFFFFFFn", { year: 2020 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.BIGINT);
			expect(tokens[0].value).toBe(0xffffffffffffffffn);
		});

		test("tokenizes binary BigInt (ES2020)", () => {
			const lexer = new Lexer("0b11111111n", { year: 2020 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.BIGINT);
			expect(tokens[0].value).toBe(0b11111111n);
		});

		test("tokenizes octal BigInt (ES2020)", () => {
			const lexer = new Lexer("0o777n", { year: 2020 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.BIGINT);
			expect(tokens[0].value).toBe(0o777n);
		});

		test("tokenizes numeric separators (ES2021)", () => {
			const lexer = new Lexer("1_000_000 3.141_592_653", { year: 2021 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(1000000);
			expect(tokens[1].value).toBe(3.141592653);
		});

		test("tokenizes hex with separators (ES2021)", () => {
			const lexer = new Lexer("0xFF_AA_BB 0xDEAD_BEEF", { year: 2021 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0xffaabb);
			expect(tokens[1].value).toBe(0xdeadbeef);
		});

		test("tokenizes binary with separators (ES2021)", () => {
			const lexer = new Lexer("0b1111_0000 0b1010_1010", { year: 2021 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0b11110000);
			expect(tokens[1].value).toBe(0b10101010);
		});

		test("tokenizes octal with separators (ES2021)", () => {
			const lexer = new Lexer("0o755_644 0o777_000", { year: 2021 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(0o755644);
			expect(tokens[1].value).toBe(0o777000);
		});

		test("tokenizes BigInt with separators (ES2021)", () => {
			const lexer = new Lexer("9_007_199_254_740_992n 0xFF_FF_FF_FFn", { year: 2021 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe(9007199254740992n);
			expect(tokens[1].value).toBe(0xffffffffn);
		});

		test("throws on invalid separator placement", () => {
			const lexer = new Lexer("1__000", { year: 2021 });
			expect(() => lexer.tokenize()).toThrow("Invalid numeric separator");
		});

		test("throws on separator at start", () => {
			const lexer = new Lexer("_1000", { year: 2021 });
			expect(() => lexer.tokenize()).toThrow();
		});

		test("throws on separator at end", () => {
			const lexer = new Lexer("1000_", { year: 2021 });
			expect(() => lexer.tokenize()).toThrow("Invalid numeric separator");
		});
	});

	describe("Template Literals", () => {
		test("tokenizes plain template string (ES2015)", () => {
			const lexer = new Lexer("`hello world`", { year: 2015 });
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.TEMPLATE_LITERAL);
			expect(tokens[0].value).toBe("hello world");
		});

		test("tokenizes multi-line template (ES2015)", () => {
			const lexer = new Lexer("`line1\nline2\nline3`", { year: 2015 });
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe("line1\nline2\nline3");
		});

		test("detects template with interpolation (ES2015)", () => {
			const lexer = new Lexer("`hello ${name}`", { year: 2015 });
			const tokens = lexer.tokenize();

			// Should return TEMPLATE_HEAD when interpolation detected
			expect(tokens[0].type).toBe(TokenType.TEMPLATE_HEAD);
		});

		test("throws on unterminated template", () => {
			const lexer = new Lexer("`unterminated", { year: 2015 });
			expect(() => lexer.tokenize()).toThrow("Unterminated template literal");
		});

		test("rejects template in ES2011 mode", () => {
			const lexer = new Lexer("`template`", { year: 2011 });
			expect(() => lexer.tokenize()).toThrow();
		});
	});

	describe("Identifiers", () => {
		test("tokenizes simple identifiers", () => {
			const lexer = new Lexer("foo bar _private $jquery");
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
			expect(tokens[0].value).toBe("foo");
			expect(tokens[1].value).toBe("bar");
			expect(tokens[2].value).toBe("_private");
			expect(tokens[3].value).toBe("$jquery");
		});

		test("tokenizes identifiers with numbers", () => {
			const lexer = new Lexer("foo123 bar456");
			const tokens = lexer.tokenize();

			expect(tokens[0].value).toBe("foo123");
			expect(tokens[1].value).toBe("bar456");
		});

		test("distinguishes keywords from identifiers", () => {
			const lexer = new Lexer("true truthy false falsy null nullable");
			const tokens = lexer.tokenize();

			expect(tokens[0].type).toBe(TokenType.TRUE);
			expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
			expect(tokens[1].value).toBe("truthy");
			expect(tokens[2].type).toBe(TokenType.FALSE);
			expect(tokens[3].type).toBe(TokenType.IDENTIFIER);
			expect(tokens[4].type).toBe(TokenType.NULL);
			expect(tokens[5].type).toBe(TokenType.IDENTIFIER);
		});
	});

	describe("Comments", () => {
		test("skips single-line comments by default", () => {
			const lexer = new Lexer("123 // comment\n456", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(3); // 123, 456, EOF
			expect(tokens[0].value).toBe(123);
			expect(tokens[1].value).toBe(456);
		});

		test("skips multi-line comments by default", () => {
			const lexer = new Lexer("123 /* comment */ 456", { year: 2011 });
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(3); // 123, 456, EOF
			expect(tokens[0].value).toBe(123);
			expect(tokens[1].value).toBe(456);
		});

		test("preserves comments when enabled", () => {
			const lexer = new Lexer("123 // comment\n456", {
				year: 2011,
				preserveComments: true
			});
			const tokens = lexer.tokenize();

			expect(tokens.some((t) => t.type === TokenType.LINE_COMMENT)).toBe(true);
			const comment = tokens.find((t) => t.type === TokenType.LINE_COMMENT);
			expect(comment?.value).toBe(" comment");
		});

		test("preserves multi-line comments when enabled", () => {
			const lexer = new Lexer("123 /* comment */ 456", {
				year: 2011,
				preserveComments: true
			});
			const tokens = lexer.tokenize();

			expect(tokens.some((t) => t.type === TokenType.BLOCK_COMMENT)).toBe(true);
			const comment = tokens.find((t) => t.type === TokenType.BLOCK_COMMENT);
			expect(comment?.value).toBe(" comment ");
		});

		test("throws on unterminated block comment", () => {
			const lexer = new Lexer("/* unterminated", { year: 2011 });
			expect(() => lexer.tokenize()).toThrow("Unterminated block comment");
		});

		test("rejects comments in JSON mode", () => {
			const lexer = new Lexer("123 // comment", { mode: "json" });
			expect(() => lexer.tokenize()).toThrow();
		});
	});

	describe("Whitespace", () => {
		test("skips whitespace between tokens", () => {
			const lexer = new Lexer("  123   456   ");
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(3); // 123, 456, EOF
		});

		test("handles all whitespace types", () => {
			const lexer = new Lexer("123\t\n\r\f\v 456");
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(3); // 123, 456, EOF
		});

		test("rejects whitespace inside tokens", () => {
			const lexer = new Lexer("1 23");
			const tokens = lexer.tokenize();

			// Should tokenize as two separate numbers, not one
			expect(tokens).toHaveLength(3); // 1, 23, EOF
			expect(tokens[0].value).toBe(1);
			expect(tokens[1].value).toBe(23);
		});
	});

	describe("Position Tracking", () => {
		test("tracks line and column", () => {
			const lexer = new Lexer('{\n  "key": "value"\n}');
			const tokens = lexer.tokenize();

			expect(tokens[0].loc?.start.line).toBe(1);
			expect(tokens[0].loc?.start.column).toBe(0);
			expect(tokens[1].loc?.start.line).toBe(2);
			expect(tokens[1].loc?.start.column).toBe(2);
		});

		test("tracks offset", () => {
			const lexer = new Lexer('{"key": "value"}');
			const tokens = lexer.tokenize();

			expect(tokens[0].loc?.start.offset).toBe(0); // {
			expect(tokens[1].loc?.start.offset).toBe(1); // "key"
			expect(tokens[2].loc?.start.offset).toBe(6); // :
		});
	});

	describe("Year-Based Feature Gating", () => {
		test("rejects binary literals before ES2015", () => {
			const lexer = new Lexer("0b1010", { year: 2011 });
			expect(() => lexer.tokenize()).toThrow();
		});

		test("allows binary literals in ES2015", () => {
			const lexer = new Lexer("0b1010", { year: 2015 });
			const tokens = lexer.tokenize();
			expect(tokens[0].value).toBe(0b1010);
		});

		test("rejects BigInt before ES2020", () => {
			const lexer = new Lexer("123n", { year: 2015 });
			expect(() => lexer.tokenize()).toThrow();
		});

		test("allows BigInt in ES2020", () => {
			const lexer = new Lexer("123n", { year: 2020 });
			const tokens = lexer.tokenize();
			expect(tokens[0].type).toBe(TokenType.BIGINT);
		});

		test("rejects numeric separators before ES2021", () => {
			const lexer = new Lexer("1_000", { year: 2020 });
			expect(() => lexer.tokenize()).toThrow();
		});

		test("allows numeric separators in ES2021", () => {
			const lexer = new Lexer("1_000", { year: 2021 });
			const tokens = lexer.tokenize();
			expect(tokens[0].value).toBe(1000);
		});
	});

	describe("Error Handling", () => {
		test("throws LexerError with location", () => {
			const lexer = new Lexer('"unterminated');

			try {
				lexer.tokenize();
				expect.fail("Should have thrown");
			} catch (error: any) {
				expect(error.message).toContain("Unterminated string");
				expect(error.loc).toBeDefined();
				expect(error.loc.start.line).toBe(1);
			}
		});

		test("provides error code", () => {
			const lexer = new Lexer('"unterminated');

			try {
				lexer.tokenize();
			} catch (error: any) {
				expect(error.code).toBeDefined();
			}
		});
	});

	describe("EOF Token", () => {
		test("always ends with EOF token", () => {
			const lexer = new Lexer("123");
			const tokens = lexer.tokenize();

			expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
		});

		test("EOF for empty input", () => {
			const lexer = new Lexer("");
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(1);
			expect(tokens[0].type).toBe(TokenType.EOF);
		});

		test("EOF for whitespace-only input", () => {
			const lexer = new Lexer("   \n\t  ");
			const tokens = lexer.tokenize();

			expect(tokens).toHaveLength(1);
			expect(tokens[0].type).toBe(TokenType.EOF);
		});
	});
});
