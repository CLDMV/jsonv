/**
 * Tests for GitHub issue #30: the exported Parser AST must be usable by
 * tooling (e.g. @cldmv/eslint-plugin-jsonv) — comments and tokens returned
 * from parse(), positioned property-key nodes, full node spans, and correct
 * start positions for tokens that span lines.
 */

import { describe, test, expect } from "vitest";
import { parseToAst as parseToAstFromRoot, parseWithOptions as parseWithOptionsFromRoot } from "../src/index.mjs";
import { Parser, parseToAst, parseWithOptions, TokenType, JsonvSyntaxError } from "../src/parser.mjs";

/** Build a Position literal. */
const pos = (line, column, offset) => ({ line, column, offset });

/** Parse with the Parser class and fail loudly on any collected parse error. */
function ast(text, options = {}) {
	const result = new Parser(text, options).parse();
	expect(result.errors).toBeUndefined();
	return result;
}

/** Assert that every token/comment/node loc slices back to the expected source text. */
function sliceOf(text, loc) {
	return text.slice(loc.start.offset, loc.end.offset);
}

describe("Parser AST for tooling (issue #30)", () => {
	describe("comments", () => {
		test("returns Line and Block comments in source order with positions", () => {
			const text = "// lead\n{ /* inner */ a: 1 }";
			const { comments } = ast(text, { preserveComments: true });

			expect(comments).toEqual([
				{ type: "Line", value: " lead", loc: { start: pos(1, 0, 0), end: pos(1, 7, 7) } },
				{ type: "Block", value: " inner ", loc: { start: pos(2, 2, 10), end: pos(2, 13, 21) } }
			]);
			expect(sliceOf(text, comments[0].loc)).toBe("// lead");
			expect(sliceOf(text, comments[1].loc)).toBe("/* inner */");
		});

		test("positions comments correctly across CRLF line breaks, including a block comment spanning lines", () => {
			const text = "{\r\n  // one\r\n  a: 1 /* two\r\n three */\r\n}";
			const { comments } = ast(text, { preserveComments: true });

			expect(comments).toEqual([
				{ type: "Line", value: " one", loc: { start: pos(2, 2, 5), end: pos(2, 8, 11) } },
				{ type: "Block", value: " two\r\n three ", loc: { start: pos(3, 7, 20), end: pos(4, 9, 37) } }
			]);
			expect(sliceOf(text, comments[1].loc)).toBe("/* two\r\n three */");
		});

		test("line comments end at \\r, U+2028 and U+2029 as well as \\n", () => {
			for (const lb of ["\r", " ", " "]) {
				const text = `[// c${lb}1]`;
				const { comments, program } = ast(text, { preserveComments: true });
				expect(comments).toEqual([{ type: "Line", value: " c", loc: { start: pos(1, 1, 1), end: pos(1, 5, 5) } }]);
				expect(program.body.elements[0].loc.start).toEqual(pos(2, 0, 6));
			}
		});

		test("returns an empty comments array when preserveComments is set and there are none", () => {
			expect(ast("{ a: 1 }", { preserveComments: true }).comments).toEqual([]);
		});

		test("omits comments when preserveComments is not set", () => {
			const result = ast("// lead\n{ /* inner */ a: 1 }");
			expect(result.comments).toBeUndefined();
		});

		test("comments anywhere between tokens parse cleanly when preserved", () => {
			const cases = [
				["1 // trailing", 1],
				["{ a /* k */ : /* v */ 1 }", { a: 1 }],
				["{ x: { y: 1 }, a: x /* c */ . /* d */ y }", { x: { y: 1 }, a: 1 }],
				["{ a: 1, t: `v${ /* c */ a /* d */ }` }", { a: 1, t: "v1" }]
			];
			for (const [text, expected] of cases) {
				expect(parseWithOptions(text, { preserveComments: true })).toEqual(expected);
				expect(parseWithOptions(text, { preserveComments: false })).toEqual(expected);
			}
			expect(ast("{ a /* k */ : /* v */ 1 }", { preserveComments: true }).comments.map((c) => c.value)).toEqual([" k ", " v "]);
		});
	});

	describe("tokens", () => {
		test("returns the positioned token stream without comments or EOF", () => {
			const text = '{"a": [1, true]} // tail';
			const { tokens } = ast(text, { preserveComments: true });

			expect(tokens.map((t) => t.type)).toEqual([
				TokenType.LBRACE,
				TokenType.STRING,
				TokenType.COLON,
				TokenType.LBRACKET,
				TokenType.NUMBER,
				TokenType.COMMA,
				TokenType.TRUE,
				TokenType.RBRACKET,
				TokenType.RBRACE
			]);
			for (const token of tokens) {
				expect(sliceOf(text, token.loc)).toBe(token.raw);
			}
			expect(tokens[1]).toEqual({ type: TokenType.STRING, value: "a", raw: '"a"', loc: { start: pos(1, 1, 1), end: pos(1, 4, 4) } });
		});

		test("returns tokens without preserveComments too", () => {
			const { tokens } = ast("[1]");
			expect(tokens.map((t) => t.raw)).toEqual(["[", "1", "]"]);
		});

		test("returns an empty token array for empty input", () => {
			const result = new Parser("", {}).parse();
			expect(result.tokens).toEqual([]);
		});
	});

	describe("property keys", () => {
		const text = '{ "q": 1, u: 2, 3: 3, 0x10: 4, true: 5, 7n: 6, n: { d: [1] } }';

		test("keys are positioned Literal / Identifier nodes", () => {
			const { program } = ast(text);
			const keys = program.body.properties.map((p) => p.key);

			expect(keys[0]).toEqual({ type: "Literal", value: "q", raw: '"q"', loc: { start: pos(1, 2, 2), end: pos(1, 5, 5) } });
			expect(keys[1]).toEqual({ type: "Identifier", name: "u", loc: { start: pos(1, 10, 10), end: pos(1, 11, 11) } });
			expect(keys[2]).toEqual({ type: "Literal", value: 3, raw: "3", loc: { start: pos(1, 16, 16), end: pos(1, 17, 17) } });
			expect(keys[3]).toMatchObject({ type: "Literal", value: 16, raw: "0x10" });
			expect(keys[4]).toMatchObject({ type: "Identifier", name: "true" });
			expect(keys[5]).toMatchObject({ type: "Literal", value: 7n, raw: "7n", bigint: "7" });
			for (const key of keys) {
				expect(sliceOf(text, key.loc)).toBe(key.type === "Identifier" ? key.name : key.raw);
			}
		});

		test("Property.loc spans the key through the value", () => {
			const { program } = ast(text);
			const spans = program.body.properties.map((p) => sliceOf(text, p.loc));
			expect(spans).toEqual(['"q": 1', "u: 2", "3: 3", "0x10: 4", "true: 5", "7n: 6", "n: { d: [1] }"]);
			const last = program.body.properties[6];
			expect(last.loc.start).toEqual(last.key.loc.start);
			expect(last.loc.end).toEqual(last.value.loc.end);
		});

		test("keyword keys (null, Infinity, NaN) become Identifier nodes", () => {
			const { program } = ast("{ null: 1, Infinity: 2, NaN: 3, false: 4 }");
			expect(program.body.properties.map((p) => p.key)).toMatchObject([
				{ type: "Identifier", name: "null" },
				{ type: "Identifier", name: "Infinity" },
				{ type: "Identifier", name: "NaN" },
				{ type: "Identifier", name: "false" }
			]);
		});

		test("evaluated values are unchanged by the key-node shape", () => {
			expect(parseWithOptions(text)).toEqual({ q: 1, u: 2, 3: 3, 16: 4, true: 5, 7: 6, n: { d: [1] } });
			expect(parseWithOptions("{ null: 1, Infinity: 2, NaN: 3, false: 4, -Infinity: 5 }")).toEqual({
				null: 1,
				Infinity: 2,
				NaN: 3,
				false: 4,
				"-Infinity": 5
			});
			expect(parseWithOptions("{ a: 1, b: a, 'c d': b }")).toEqual({ a: 1, b: 1, "c d": 1 });
		});

		test("an invalid key in tolerant mode yields a positioned placeholder key", () => {
			const result = new Parser("{ [: 1 }", { tolerant: true }).parse();
			expect(result.errors.length).toBeGreaterThan(0);
			const key = result.program.body.properties[0].key;
			expect(key).toEqual({ type: "Literal", value: "error", raw: "[", loc: { start: pos(1, 2, 2), end: pos(1, 3, 3) } });
		});
	});

	describe("multi-line token start positions", () => {
		test("a string with a CRLF line continuation starts on its own line (issue repro)", () => {
			const text = '{\n  a: 1,\n  b: "q\\\r\nr",\n  c: 2\n}';
			const { program } = ast(text);
			const [a, b, c] = program.body.properties;

			expect(a.value.loc).toEqual({ start: pos(2, 5, 7), end: pos(2, 6, 8) });
			expect(b.value.loc).toEqual({ start: pos(3, 5, 15), end: pos(4, 2, 22) });
			expect(b.value.value).toBe("qr");
			expect(c.key.loc.start).toEqual(pos(5, 2, 26));
			expect(c.value.loc).toEqual({ start: pos(5, 5, 29), end: pos(5, 6, 30) });
		});

		test("LF and single-quoted line continuations are positioned too", () => {
			const text = "['x\\\ny', \"p\\\nq\", 12]";
			const { program } = ast(text);
			const [first, second, third] = program.body.elements;

			expect(first.loc).toEqual({ start: pos(1, 1, 1), end: pos(2, 2, 7) });
			expect(second.loc).toEqual({ start: pos(2, 4, 9), end: pos(3, 2, 15) });
			expect(third.loc).toEqual({ start: pos(3, 4, 17), end: pos(3, 6, 19) });
		});

		test("every token's start offset slices back to its raw text", () => {
			const text = "{\r\n  s: 'a\\\r\nb',\r  n: -12.5e3,   big: 0x1Fn,   t: `x\ny`, i: -Infinity\r\n}";
			const { tokens } = ast(text);
			for (const token of tokens) {
				expect(sliceOf(text, token.loc)).toBe(token.raw);
			}
		});
	});

	describe("line breaks", () => {
		test("\\n, \\r\\n, lone \\r, U+2028 and U+2029 each count as one line break", () => {
			const cases = [
				["[1,\n2]", pos(2, 0, 4)],
				["[1,\r\n2]", pos(2, 0, 5)],
				["[1,\r2]", pos(2, 0, 4)],
				["[1, 2]", pos(2, 0, 4)],
				["[1, 2]", pos(2, 0, 4)],
				["[\r\n\r  \n  1]", pos(6, 2, 9)]
			];
			for (const [text, expected] of cases) {
				const { program } = ast(text);
				const last = program.body.elements.at(-1);
				expect(last.loc.start).toEqual(expected);
			}
		});

		test("a CRLF counts as one line break on its own \\n, not twice", () => {
			const { program } = ast("[\r\n\r\n1]");
			expect(program.body.elements[0].loc.start).toEqual(pos(3, 0, 5));
		});

		test("parse errors after a lone \\r / U+2028 report the corrected line", () => {
			for (const lb of ["\r", " ", " ", "\r\n"]) {
				try {
					parseWithOptions(`[1,${lb}}`);
					expect.unreachable("should throw");
				} catch (err) {
					expect(err).toBeInstanceOf(JsonvSyntaxError);
					expect(err.line).toBe(2);
					expect(err.column).toBe(0);
				}
			}
		});
	});

	describe("complete spans", () => {
		test("TemplateLiteral.loc spans head to tail", () => {
			const text = "{ x: 1, y: 2, t: `a${x}b${y}c` }";
			const { program } = ast(text);
			const template = program.body.properties[2].value;

			expect(template.type).toBe("TemplateLiteral");
			expect(sliceOf(text, template.loc)).toBe("`a${x}b${y}c`");
			expect(template.loc.start).toEqual(template.quasis[0].loc.start);
			expect(template.loc.end).toEqual(template.quasis.at(-1).loc.end);
		});

		test("a multi-line TemplateLiteral spans every line", () => {
			const text = "{ x: 1, t: `a\n${x}\nb` }";
			const { program } = ast(text);
			const template = program.body.properties[1].value;
			expect(template.loc).toEqual({ start: pos(1, 11, 11), end: pos(3, 2, 21) });
		});

		test("an unterminated interpolation in tolerant mode ends the span at the last consumed token", () => {
			const result = new Parser("`a${x", { tolerant: true }).parse();
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.program.body.loc).toEqual({ start: pos(1, 0, 0), end: pos(1, 5, 5) });
		});

		test("Program.loc covers the whole document, including surrounding whitespace and comments", () => {
			const text = "// head\n  { a: 1 }  \n";
			const { program } = ast(text, { preserveComments: true });
			expect(program.loc).toEqual({ start: pos(1, 0, 0), end: pos(3, 0, text.length) });
			expect(sliceOf(text, program.loc)).toBe(text);
		});

		test("Program.loc of empty input is an empty span", () => {
			const { program } = new Parser("", {}).parse();
			expect(program.loc).toEqual({ start: pos(1, 0, 0), end: pos(1, 0, 0) });
		});
	});

	describe("parseToAst()", () => {
		test("is exported from the package root and the parser subpath", () => {
			expect(parseToAst).toBeTypeOf("function");
			expect(parseToAstFromRoot).toBe(parseToAst);
			expect(parseWithOptionsFromRoot).toBe(parseWithOptions);
		});

		test("returns program, comments, tokens and errors, preserving comments by default", () => {
			const text = "/* c */ { a: 1 }";
			const result = parseToAst(text);

			expect(Object.keys(result).sort()).toEqual(["comments", "errors", "program", "tokens"]);
			expect(result.errors).toEqual([]);
			expect(result.comments).toEqual([{ type: "Block", value: " c ", loc: { start: pos(1, 0, 0), end: pos(1, 7, 7) } }]);
			expect(result.tokens.map((t) => t.raw)).toEqual(["{", "a", ":", "1", "}"]);
			expect(result.program.body.type).toBe("ObjectExpression");
		});

		test("preserveComments: false returns an empty comments array", () => {
			expect(parseToAst("/* c */ 1", { preserveComments: false }).comments).toEqual([]);
		});

		test("collects parse errors instead of throwing", () => {
			const result = parseToAst("[1 2]");
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toMatchObject({ code: "PARSE_ERROR", loc: { start: pos(1, 3, 3) } });
			expect(parseToAst("[1 2, }", { tolerant: true }).errors.length).toBeGreaterThan(1);
		});

		test("throws a JsonvSyntaxError for lexical errors", () => {
			expect(() => parseToAst('{ a: "open')).toThrow(JsonvSyntaxError);
		});

		test("does not evaluate references", () => {
			const result = parseToAst("{ a: missing }");
			expect(result.errors).toEqual([]);
			expect(result.program.body.properties[0].value).toMatchObject({ type: "Identifier", name: "missing" });
		});
	});
});
