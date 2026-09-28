/**
 * Tests for GitHub issue #56: inside a template literal, a CRLF pair or a lone CR
 * is one line terminator whose cooked value (TV) and raw value (TRV) are both LF,
 * as in ECMAScript. Token and quasi `loc` keep describing the original source.
 *
 * Expected values come from the engine: each template is evaluated by Node with
 * `new Function`, and a tag function reads the engine's own cooked and raw strings.
 */

import { describe, test, expect } from "vitest";
import { parseToAst, parseWithOptions, TokenType } from "../src/parser.mjs";

const TEMPLATE_TOKEN_TYPES = new Set([
	TokenType.TEMPLATE_LITERAL,
	TokenType.TEMPLATE_HEAD,
	TokenType.TEMPLATE_MIDDLE,
	TokenType.TEMPLATE_TAIL
]);

const LINE_TERMINATORS = {
	LF: "\n",
	CRLF: "\r\n",
	CR: "\r"
};

/**
 * Evaluate a template literal source with Node.
 * @param {string} template - Template source, backticks included.
 * @param {Record<string, unknown>} [scope] - Values of the identifiers the interpolations use.
 * @returns {{ value: string, cooked: string[], raw: string[] }} The evaluated string and the engine's per-segment cooked and raw strings.
 */
function engine(template, scope = {}) {
	const names = Object.keys(scope);
	const values = Object.values(scope);
	const value = new Function(...names, `return ${template};`)(...values);
	const { cooked, raw } = new Function(...names, `return ((strings) => ({ cooked: [...strings], raw: [...strings.raw] }))${template};`)(
		...values
	);
	return { value, cooked, raw };
}

/**
 * Remove a template token's or quasi's delimiters from its raw text:
 * the leading `` ` `` or `}`, and the trailing `` ` `` or `${`.
 */
function stripDelimiters(raw) {
	const head = raw.slice(1);
	return head.endsWith("${") ? head.slice(0, -2) : head.slice(0, -1);
}

/** Template tokens of a parseToAst result, in source order. */
function templateTokens(result) {
	return result.tokens.filter((t) => TEMPLATE_TOKEN_TYPES.has(t.type));
}

/**
 * Parse `{ <scope entries>, t: <template> }` and check the evaluated value, the
 * tokens and the AST against Node's evaluation of the same template.
 */
function expectMatchesEngine(template, scope = {}) {
	const prefix = Object.entries(scope)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}, `)
		.join("");
	const text = `{ ${prefix}t: ${template} }`;
	const expected = engine(template, scope);

	// Evaluated (cooked) value
	expect(parseWithOptions(text).t).toBe(expected.value);

	// Tokens: cooked value and delimiter-free raw per segment
	const result = parseToAst(text);
	expect(result.errors).toEqual([]);
	const tokens = templateTokens(result);
	expect(tokens.map((t) => t.value)).toEqual(expected.cooked);
	expect(tokens.map((t) => stripDelimiters(t.raw))).toEqual(expected.raw);

	// AST: a Literal for a plain template, TemplateElement quasis otherwise
	const node = result.program.body.properties.at(-1).value;
	if (node.type === "Literal") {
		expect([node.value]).toEqual(expected.cooked);
		expect([stripDelimiters(node.raw)]).toEqual(expected.raw);
	} else {
		expect(node.quasis.map((q) => q.value.cooked)).toEqual(expected.cooked);
		expect(node.quasis.map((q) => stripDelimiters(q.value.raw))).toEqual(expected.raw);
	}

	// Every template token and quasi still points at the original source
	for (const token of tokens) {
		const slice = text.slice(token.loc.start.offset, token.loc.end.offset);
		expect(slice.replace(/\r\n?/g, "\n")).toBe(token.raw);
	}
	return { text, result };
}

describe("template line terminators follow ECMAScript (issue #56)", () => {
	test("the issue #56 reproduction", () => {
		expect(parseWithOptions("{ t: `a\r\nb`, u: `c\rd` }", { year: 2015 })).toEqual({
			t: engine("`a\r\nb`").value,
			u: engine("`c\rd`").value
		});
		expect(parseWithOptions("{ t: `a\r\nb`, u: `c\rd` }", { year: 2015 })).toEqual({ t: "a\nb", u: "c\nd" });
	});

	describe.each(Object.entries(LINE_TERMINATORS))("%s", (_name, lt) => {
		test("a plain template matches the engine (cooked and raw)", () => {
			expectMatchesEngine(`\`a${lt}b${lt}${lt}c${lt}\``);
		});

		test("a multi-line template with interpolations matches the engine", () => {
			expectMatchesEngine(`\`${lt}line1${lt}\${a}${lt}line2\${b}${lt}\${a}${lt}\``, { a: 1, b: "x" });
		});

		test("line breaks inside the interpolation braces do not reach the value", () => {
			expectMatchesEngine(`\`x\${${lt}a${lt}}y${lt}\${${lt}b${lt}}z\``, { a: 1, b: 2 });
		});

		test("a line continuation cooks to nothing and keeps a normalized raw", () => {
			expectMatchesEngine(`\`a\\${lt}b\${a}c\\${lt}d\``, { a: 1 });
		});

		test("an escaped \\r next to a real line break still cooks to CR", () => {
			expectMatchesEngine(`\`a\\r${lt}b\\r\\n\${a}\\r${lt}\``, { a: 1 });
		});
	});

	test("CRLF, CR and LF sources evaluate to the same value and raw", () => {
		const build = (lt) => `{ a: 1, t: \`one${lt}two\${a}${lt}three${lt}\` }`;
		const results = Object.values(LINE_TERMINATORS).map((lt) => {
			const text = build(lt);
			const quasis = parseToAst(text).program.body.properties[1].value.quasis;
			return {
				value: parseWithOptions(text),
				cooked: quasis.map((q) => q.value.cooked),
				raw: quasis.map((q) => q.value.raw)
			};
		});
		expect(results[1]).toEqual(results[0]);
		expect(results[2]).toEqual(results[0]);
		expect(results[0]).toEqual({
			value: { a: 1, t: "one\ntwo1\nthree\n" },
			cooked: ["one\ntwo", "\nthree\n"],
			raw: ["`one\ntwo${", "}\nthree\n`"]
		});
	});

	test("an escaped \\r stays CR while a literal CR becomes LF", () => {
		const { result } = expectMatchesEngine("`a\\rb\rc`");
		const [token] = templateTokens(result);
		expect(token.value).toBe("a\rb\nc");
		expect(token.raw).toBe("`a\\rb\nc`");
	});

	test("U+2028 and U+2029 in template text are kept, as in ECMAScript", () => {
		expectMatchesEngine("`a b c`");
		expect(parseWithOptions("`a b c`")).toBe("a b c");
	});

	test("tokens and quasis keep the positions of the original CRLF source", () => {
		const text = "{\r\n  a: 1,\r\n  t: `x\r\n${a}\r\ny`\r\n}";
		const result = parseToAst(text);
		const [head, tail] = templateTokens(result);

		expect(head.raw).toBe("`x\n${");
		expect(head.loc).toEqual({ start: { line: 3, column: 5, offset: 17 }, end: { line: 4, column: 2, offset: 23 } });
		expect(text.slice(head.loc.start.offset, head.loc.end.offset)).toBe("`x\r\n${");

		expect(tail.raw).toBe("}\ny`");
		expect(tail.loc).toEqual({ start: { line: 4, column: 3, offset: 24 }, end: { line: 5, column: 2, offset: 29 } });
		expect(text.slice(tail.loc.start.offset, tail.loc.end.offset)).toBe("}\r\ny`");

		const { quasis } = result.program.body.properties[1].value;
		expect(quasis.map((q) => q.loc)).toEqual([head.loc, tail.loc]);
		expect(quasis.map((q) => q.value.raw)).toEqual([head.raw, tail.raw]);
		expect(quasis.map((q) => q.value.cooked)).toEqual(["x\n", "\ny"]);
	});

	test("a lone CR still advances the line of later tokens", () => {
		const text = "`a\rb\rc`";
		const [token] = templateTokens(parseToAst(text));
		expect(token.loc).toEqual({ start: { line: 1, column: 0, offset: 0 }, end: { line: 3, column: 2, offset: text.length } });
	});
});

describe("string line continuations follow ECMAScript (issue #56)", () => {
	const continuations = { ...LINE_TERMINATORS, LS: " ", PS: " " };

	test.each(Object.entries(continuations))("%s after a backslash in a string cooks to nothing", (_name, lt) => {
		for (const source of [`"a\\${lt}b"`, `'a\\${lt}b'`]) {
			const expected = new Function(`return ${source};`)();
			expect(parseWithOptions(source)).toBe(expected);
			const [token] = parseToAst(source).tokens;
			expect(token.value).toBe(expected);
			expect(token.raw).toBe(source); // string raw is the source slice, unchanged
		}
	});

	test.each(Object.entries(continuations))("%s after a backslash in a template cooks to nothing", (_name, lt) => {
		expectMatchesEngine(`\`a\\${lt}b\``);
	});

	test("string escapes for CR and LF are unchanged", () => {
		const source = String.raw`"a\r\nb\rc"`;
		expect(parseWithOptions(source)).toBe(new Function(`return ${source};`)());
		expect(parseWithOptions(source)).toBe("a\r\nb\rc");
	});
});
