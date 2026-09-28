/**
 * Tests for GitHub issue #51: parseToAst() collects lexical errors into
 * `errors` (with the same shape as parse errors) instead of throwing them,
 * returns the tokens and comments lexed before the error and a partial
 * program, and in tolerant mode recovers from lexical errors and keeps going.
 * parse() / parseWithOptions() / Parser#parse() still throw.
 */

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { parse, parseToAst, parseWithOptions, Parser, JsonvSyntaxError } from "../src/parser.mjs";
import { LexerError } from "../src/lexer/lexer-types.mjs";

/** Build a Position literal. */
const pos = (line, column, offset) => ({ line, column, offset });

/** Run fn and return the error it throws. */
function thrown(fn) {
	try {
		fn();
	} catch (err) {
		return err;
	}
	throw new Error("expected an error");
}

/** Summarize collected errors as `code@offset` strings. */
const summary = (errors) => errors.map((e) => `${e.code}@${e.offset}`);

describe("parseToAst collects lexical errors (issue #51)", () => {
	describe("each lexical error kind is collected with the position and code parseWithOptions throws", () => {
		const cases = [
			["unterminated string at end of input", '{ a: "open', {}, "UNTERMINATED_STRING"],
			["unterminated string at end of line", '{ a: "open\n}', {}, "UNTERMINATED_STRING"],
			["unterminated template", "{ t: `abc }", { year: 2015 }, "UNTERMINATED_TEMPLATE"],
			["unterminated template tail", "{ a: 1, t: `x${a}yz }", {}, "UNTERMINATED_TEMPLATE"],
			["invalid unicode escape", '{ a: "\\u12" }', {}, "INVALID_UNICODE_ESCAPE"],
			["invalid hex escape", '{ a: "\\x4" }', {}, "INVALID_HEX_ESCAPE"],
			["unterminated block comment", "{ a: 1 } /* open", {}, "UNTERMINATED_COMMENT"],
			["comment in JSON mode", '// c\n{ "a": 1 }', { mode: "json" }, "COMMENTS_NOT_ALLOWED"],
			["unexpected character", "{ a: @ }", {}, "UNEXPECTED_CHARACTER"],
			["identifier after minus", "{ a: -Ix }", {}, "UNEXPECTED_TOKEN"],
			["numeric literal starting with an underscore", "{ a: _1 }", {}, "INVALID_SEPARATOR"],
			["year-gated numeric separator", "{ a: 1_000 }", { year: 2015 }, "INVALID_SEPARATOR"],
			["misplaced numeric separator", "{ a: 1__0 }", {}, "INVALID_SEPARATOR"],
			["year-gated binary literal", "{ a: 0b1 }", { year: 2011 }, "INVALID_LITERAL"],
			["year-gated BigInt literal", "{ a: 1n }", { year: 2015 }, "INVALID_BIGINT"],
			["BigInt with a decimal point", "{ a: 1.5n }", {}, "INVALID_BIGINT"],
			["hex literal without digits", "{ a: 0x }", {}, "INVALID_HEX"],
			["binary literal without digits", "{ a: 0b }", {}, "INVALID_BINARY"],
			["legacy octal in strict mode", "{ a: 0755 }", { strictOctal: true }, "INVALID_OCTAL"],
			["exponent without digits", "{ a: 1e }", {}, "INVALID_EXPONENT"]
		];

		for (const tolerant of [false, true]) {
			for (const [name, text, options, code] of cases) {
				test(`${name}${tolerant ? " (tolerant)" : ""}`, () => {
					const expected = thrown(() => parseWithOptions(text, options));
					expect(expected).toBeInstanceOf(LexerError);
					expect(expected.code).toBe(code);

					const { errors } = parseToAst(text, { ...options, tolerant });
					expect(errors[0]).toEqual({
						message: expected.message,
						code,
						loc: expected.loc,
						line: expected.line,
						column: expected.column,
						offset: expected.offset
					});
					if (tolerant) {
						// Text that runs to the end of input also leaves the object unclosed
						expect(errors.slice(1).map((e) => e.code)).toEqual(errors.slice(1).map(() => "PARSE_ERROR"));
					} else {
						expect(errors).toHaveLength(1);
					}
				});
			}
		}
	});

	test("the issue's example returns its error instead of throwing", () => {
		const result = parseToAst("{ t: `abc }", { year: 2015 });
		expect(result.errors).toEqual([
			{
				message: "Unterminated template literal",
				code: "UNTERMINATED_TEMPLATE",
				loc: { start: pos(1, 11, 11), end: pos(1, 11, 11) },
				line: 1,
				column: 11,
				offset: 11
			}
		]);
	});

	test("lexical and parse errors are plain objects of the same shape", () => {
		const lexical = parseToAst('{ a: "open').errors[0];
		const grammar = parseToAst("[1 2]").errors[0];
		expect(Object.getPrototypeOf(lexical)).toBe(Object.prototype);
		expect(Object.getPrototypeOf(grammar)).toBe(Object.prototype);
		expect(Object.keys(lexical).sort()).toEqual(Object.keys(grammar).sort());
		expect(grammar).toEqual({
			message: "Expected ',' or ']' in array",
			code: "PARSE_ERROR",
			loc: { start: pos(1, 3, 3), end: pos(1, 4, 4) },
			line: 1,
			column: 3,
			offset: 3
		});
	});

	describe("without tolerant", () => {
		test("returns the tokens and comments lexed before the error", () => {
			const text = '// lead\n{ a: 1, /* mid */ b: "open, c: 2 } // after';
			const { tokens, comments, errors } = parseToAst(text);
			expect(summary(errors)).toEqual([`UNTERMINATED_STRING@${text.length}`]);
			expect(tokens.map((t) => t.raw)).toEqual(["{", "a", ":", "1", ",", "b", ":"]);
			expect(comments.map((c) => c.value)).toEqual([" lead", " mid "]);
		});

		test("returns the partial program recovered from those tokens", () => {
			const text = '{ a: 1, b: "open, c: 2 }';
			const { program } = parseToAst(text);
			// Program still spans the whole input
			expect(program.loc).toEqual({ start: pos(1, 0, 0), end: pos(1, text.length, text.length) });
			const [a, b] = program.body.properties;
			expect(program.body.properties).toHaveLength(2);
			expect(a.value).toMatchObject({ type: "Literal", value: 1 });
			expect(b.key).toMatchObject({ type: "Identifier", name: "b" });
			expect(b.value).toMatchObject({ type: "Literal", value: null });
		});

		test("reports the lexical error even when a parse error comes earlier", () => {
			// parseWithOptions throws the lexical error for this input too
			const text = '{ a: 1 b: 2, c: "open }';
			expect(thrown(() => parseWithOptions(text)).code).toBe("UNTERMINATED_STRING");
			expect(summary(parseToAst(text).errors)).toEqual(["UNTERMINATED_STRING@23"]);
		});

		test("stops at the first of several lexical errors", () => {
			expect(summary(parseToAst('{ a: @, b: "\\u1" }').errors)).toEqual(["UNEXPECTED_CHARACTER@5"]);
		});
	});

	describe("tolerant mode", () => {
		test("reports every lexical and parse error in source order", () => {
			const text = '{ a: 9007199254740993, b: "\\u12", [: 1, c: @, d: 0x, e: `\\u1${a}`, f: -9007199254740993 }';
			const { errors } = parseToAst(text, { tolerant: true, strictBigInt: true });
			const unsafe = (n) =>
				`Integer ${n} is outside safe integer range. Use BigInt suffix 'n' for integers larger than 9007199254740991 or smaller than -9007199254740991`;
			expect(errors.map((e) => [e.code, e.offset, e.message])).toEqual([
				["PARSE_ERROR", text.indexOf("9007"), unsafe(9007199254740992)],
				["INVALID_UNICODE_ESCAPE", text.indexOf('", ['), "Invalid unicode escape sequence"],
				["PARSE_ERROR", text.indexOf("["), "Expected property key, got LBRACKET"],
				["UNEXPECTED_CHARACTER", text.indexOf("@"), "Unexpected character: '@'"],
				["INVALID_HEX", text.indexOf("0x,") + 2, "Hex literal must have at least one digit"],
				["INVALID_UNICODE_ESCAPE", text.indexOf("${a}"), "Invalid unicode escape sequence"],
				["PARSE_ERROR", text.indexOf("-9007"), unsafe(-9007199254740992)]
			]);
		});

		test("an unreadable value keeps its place and adds no parse error", () => {
			const text = '{ a: "\\u12", b: 1, c: @, d: 0x, e: `\\u1${a}` }';
			const { program, tokens, errors } = parseToAst(text, { tolerant: true });
			expect(summary(errors)).toEqual([
				"INVALID_UNICODE_ESCAPE@10",
				"UNEXPECTED_CHARACTER@22",
				"INVALID_HEX@30",
				"INVALID_UNICODE_ESCAPE@39"
			]);
			const values = program.body.properties.map((p) => [p.key.name, p.value.type, p.value.value, p.value.raw]);
			expect(values).toEqual([
				["a", "Literal", null, '"\\u12"'],
				["b", "Literal", 1, "1"],
				["c", "Literal", null, "@"],
				["d", "Literal", null, "0x"],
				["e", "Literal", null, "`\\u1${a}`"]
			]);
			// Each placeholder's raw is exactly its source text
			for (const property of program.body.properties) {
				expect(text.slice(property.value.loc.start.offset, property.value.loc.end.offset)).toBe(property.value.raw);
			}
			// Positions point at the character that made the text unreadable
			expect(text[errors[0].offset]).toBe('"');
			// Unreadable text has no token
			expect(tokens.map((t) => t.raw)).toEqual(["{", "a", ":", ",", "b", ":", "1", ",", "c", ":", ",", "d", ":", ",", "e", ":", "}"]);
		});

		test("an unreadable key keeps its place", () => {
			const { program, errors } = parseToAst('{ "\\x1": 1, b: 2 }', { tolerant: true });
			expect(summary(errors)).toEqual(["INVALID_HEX_ESCAPE@6"]);
			expect(program.body.properties.map((p) => p.key)).toMatchObject([
				{ type: "Literal", value: null, raw: '"\\x1"' },
				{ type: "Identifier", name: "b" }
			]);
		});

		test("an unterminated string resyncs at the end of its line", () => {
			const text = '// c\n{ a: 1 /* x */, b: "open\n , c: 2 }';
			const { program, comments, errors } = parseToAst(text, { tolerant: true });
			expect(errors).toEqual([expect.objectContaining({ code: "UNTERMINATED_STRING", line: 2, column: 24, offset: 29 })]);
			expect(comments.map((c) => c.value)).toEqual([" c", " x "]);
			expect(program.body.properties.map((p) => [p.key.name, p.value.value])).toEqual([
				["a", 1],
				["b", null],
				["c", 2]
			]);
		});

		test("a bad escape skips the rest of the string, escaped quotes included", () => {
			const { program, errors } = parseToAst('["\\u1\\"x", 2]', { tolerant: true });
			expect(summary(errors)).toEqual(["INVALID_UNICODE_ESCAPE@5"]);
			expect(program.body.elements.map((e) => e.raw)).toEqual(['"\\u1\\"x"', "2"]);
		});

		test("a bad escape before a backslash at the end of input skips to the end", () => {
			const { tokens, errors } = parseToAst('[1, "\\u1\\', { tolerant: true });
			expect(errors.map((e) => [e.code, e.offset])).toEqual([
				["INVALID_UNICODE_ESCAPE", 8],
				["PARSE_ERROR", 9],
				["PARSE_ERROR", 9]
			]);
			expect(tokens.map((t) => t.raw)).toEqual(["[", "1", ","]);
		});

		test("a bad template segment skips to the closing backtick and leaves the template", () => {
			const text = "{ a: 1, t: `x${a}\\u1 ${a}`, u: `y${a}` }";
			const { program, errors } = parseToAst(text, { tolerant: true });
			expect(summary(errors)).toEqual(["INVALID_UNICODE_ESCAPE@20"]);
			const [, t, u] = program.body.properties;
			expect(t.value.type).toBe("TemplateLiteral");
			expect(t.value.quasis.map((q) => q.value.raw)).toEqual(["`x${"]);
			expect(t.value.loc.end.offset).toBe(text.indexOf("`,") + 1);
			// The next template lexes normally
			expect(u.value.quasis.map((q) => q.value.raw)).toEqual(["`y${", "}`"]);
		});

		test("a bad template inside an interpolation stays inside it", () => {
			const { program, errors } = parseToAst("{ a: 1, t: `x${ `\\u1` }y` }", { tolerant: true });
			expect(summary(errors)).toEqual(["INVALID_UNICODE_ESCAPE@20"]);
			const t = program.body.properties[1].value;
			expect(t.expressions).toMatchObject([{ type: "Literal", value: null, raw: "`\\u1`" }]);
			expect(t.quasis.map((q) => q.value.raw)).toEqual(["`x${", "}y`"]);
		});

		test("comments rejected in JSON mode are skipped, not returned", () => {
			const text = '// line\n{ "a": /* block */ 1 }';
			const { program, comments, errors } = parseToAst(text, { mode: "json", tolerant: true });
			expect(summary(errors)).toEqual(["COMMENTS_NOT_ALLOWED@0", "COMMENTS_NOT_ALLOWED@15"]);
			expect(comments).toEqual([]);
			expect(program.body.properties[0].value).toMatchObject({ type: "Literal", value: 1 });
		});

		test("an unterminated block comment is skipped to the end of input", () => {
			const { program, errors, comments } = parseToAst("[1] /* open", { tolerant: true });
			// Positioned at the start of the comment
			expect(summary(errors)).toEqual(["UNTERMINATED_COMMENT@4"]);
			expect(comments).toEqual([]);
			expect(program.body.elements.map((e) => e.value)).toEqual([1]);
		});

		test("a stray character is skipped as one unit, surrogate pairs included", () => {
			const { program, errors } = parseToAst("[😀, #, 3]", { tolerant: true });
			expect(summary(errors)).toEqual(["UNEXPECTED_CHARACTER@1", "UNEXPECTED_CHARACTER@5"]);
			expect(program.body.elements.map((e) => e.raw)).toEqual(["😀", "#", "3"]);
		});

		test("a bad number or signed word is skipped through its last character", () => {
			const { program, errors } = parseToAst("[1n, 1_000.5, -foo, _1x, 1e+, 2]", { year: 2015, tolerant: true });
			expect(summary(errors)).toEqual([
				"INVALID_BIGINT@2",
				"INVALID_SEPARATOR@6",
				"UNEXPECTED_CHARACTER@14",
				"INVALID_SEPARATOR@20",
				"INVALID_EXPONENT@28"
			]);
			expect(program.body.elements.map((e) => e.raw)).toEqual(["1n", "1_000.5", "-foo", "_1x", "1e+", "2"]);
		});

		test("recovers after a template head error at the end of input", () => {
			const { errors, tokens } = parseToAst("[1, `open", { tolerant: true });
			// The template runs to the end of input, so the array is left unclosed
			expect(errors.map((e) => [e.code, e.offset, e.message])).toEqual([
				["UNTERMINATED_TEMPLATE", 9, "Unterminated template literal"],
				["PARSE_ERROR", 9, "Expected ',' or ']' in array"],
				["PARSE_ERROR", 9, "Expected RBRACKET, got EOF"]
			]);
			expect(tokens.map((t) => t.raw)).toEqual(["[", "1", ","]);
		});
	});

	describe("documents without errors are unaffected", () => {
		const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

		/** Collect the non-violation fixture files with their ES year. */
		function fixtures(dir) {
			const files = [];
			for (const entry of readdirSync(dir)) {
				const full = join(dir, entry);
				if (statSync(full).isDirectory()) {
					if (entry !== "violations") files.push(...fixtures(full));
				} else if (entry.endsWith(".jsonv")) {
					files.push(full);
				}
			}
			return files;
		}

		const files = fixtures(FIXTURES_DIR);

		test("the fixture set is not empty", () => {
			expect(files.length).toBeGreaterThan(10);
		});

		for (const file of files) {
			const year = Number(file.slice(FIXTURES_DIR.length + 1, FIXTURES_DIR.length + 5));
			test(`${year}/${basename(file)} matches Parser#parse`, () => {
				const text = readFileSync(file, "utf8");
				const expected = new Parser(text, { year, preserveComments: true }).parse();
				expect(expected.errors).toBeUndefined();
				expect(parseToAst(text, { year })).toEqual({
					program: expected.program,
					comments: expected.comments,
					tokens: expected.tokens,
					errors: []
				});
				expect(parseToAst(text, { year, tolerant: true })).toEqual(parseToAst(text, { year }));
			});
		}
	});

	describe("the throwing entry points are unchanged", () => {
		const inputs = ['{ a: "open', "{ t: `abc }", '{ a: "\\u12" }', "{ a: @ }", "{ a: 1n }"];

		for (const text of inputs) {
			test(`parseWithOptions, parse and Parser#parse throw a LexerError for ${JSON.stringify(text)}`, () => {
				const options = { year: 2015 };
				const fromOptions = thrown(() => parseWithOptions(text, options));
				expect(fromOptions).toBeInstanceOf(LexerError);
				expect(fromOptions).toBeInstanceOf(JsonvSyntaxError);
				expect(thrown(() => parseWithOptions(text, { ...options, tolerant: true }))).toMatchObject({
					code: fromOptions.code,
					offset: fromOptions.offset
				});
				expect(thrown(() => new Parser(text, options).parse())).toMatchObject({
					name: "LexerError",
					code: fromOptions.code,
					offset: fromOptions.offset
				});
			});
		}

		test("parse() throws the same LexerError", () => {
			const err = thrown(() => parse('{ a: "open'));
			expect(err).toBeInstanceOf(LexerError);
			expect(err).toMatchObject({ code: "UNTERMINATED_STRING", line: 1, column: 10, offset: 10 });
		});

		test("Lexer#tokenize still throws", async () => {
			const { Lexer } = await import("../src/lexer/lexer.mjs");
			expect(() => new Lexer('"open').tokenize()).toThrow(LexerError);
		});
	});
});
