/**
 * Tests for GitHub issue #47: the tokens returned by parseToAst() and the
 * TemplateLiteral quasis must tile a template's source with no gaps. The `}`
 * that closes an interpolation is the first character of the following
 * TemplateMiddle/TemplateTail token and quasi, and every template token/quasi
 * keeps its delimiters in `raw` and `loc`.
 */

import { describe, test, expect } from "vitest";
import { parseToAst, parseWithOptions, TokenType } from "../src/parser.mjs";

/** Build a Position literal. */
const pos = (line, column, offset) => ({ line, column, offset });

/** Source text covered by a loc. */
const sliceOf = (text, loc) => text.slice(loc.start.offset, loc.end.offset);

/**
 * Line/column of an offset, using the documented line-break rules:
 * `\n`, `\r\n` (one break), a lone `\r`, U+2028 and U+2029.
 */
function positionAt(text, offset) {
	let line = 1;
	let column = 0;
	for (let i = 0; i < offset; i++) {
		const ch = text[i];
		if (ch === "\r" && text[i + 1] === "\n") {
			continue; // the \n that follows ends the line
		}
		if (ch === "\n" || ch === "\r" || ch === " " || ch === " ") {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return pos(line, column, offset);
}

/** Collect every TemplateLiteral node in the AST, depth first. */
function templatesIn(node, found = []) {
	if (node === null || typeof node !== "object") return found;
	if (Array.isArray(node)) {
		for (const child of node) templatesIn(child, found);
		return found;
	}
	if (node.type === "TemplateLiteral") found.push(node);
	for (const [key, child] of Object.entries(node)) {
		if (key !== "loc") templatesIn(child, found);
	}
	return found;
}

/**
 * Parse and return tokens (without EOF) and comments sorted by offset. Fails on
 * any collected error, unless `rejected` is set: then the input must produce
 * only UNSUPPORTED_INTERPOLATION errors (an object or array literal inside
 * `${}`, issue #50), whose tokens must tile the source all the same.
 */
function parse(text, rejected = false) {
	const result = parseToAst(text, { tolerant: rejected });
	if (rejected) {
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors.map((e) => e.code)).toEqual(result.errors.map(() => "UNSUPPORTED_INTERPOLATION"));
	} else {
		expect(result.errors).toEqual([]);
	}
	const spans = [...result.tokens.filter((t) => t.type !== TokenType.EOF), ...result.comments].sort(
		(a, b) => a.loc.start.offset - b.loc.start.offset
	);
	return { ...result, spans };
}

const WHITESPACE_ONLY = /^\s*$/u;

const cases = {
	"single interpolation (issue #47 reproduction)": "{ host: 'x', url: `http://${host}/path` }",
	"several interpolations": "{ a: 1, b: 2, c: 3, t: `${a}-${b}-${c}` }",
	"empty segments between and around interpolations": "{ a: 1, b: 2, t: `${a}${b}` }",
	"top-level template with only an interpolation": "`${a}`",
	"nested template inside an interpolation": "{ a: 1, t: `a${ `b${a}c` }d` }",
	"three levels of nesting": "{ a: 1, t: `1${`2${`3${a}3`}2`}1` }",
	"nested template with middles on both levels": "{ a: 1, b: 2, t: `<${ `(${a})[${b}]` }|${a}>` }",
	"member expression and literals as interpolations": "{ a: { b: 1 }, t: `${a.b}:${ 5 }:${'s'}:${\"d\"}` }",
	"whitespace and comments inside interpolations": "{ a: 1, t: `x${ /* c */ a // d\n }y${\ta\t}z` }",
	"template text containing braces and a lone $": "{ a: 1, t: `}{$${a}}$}{` }",
	"escape sequences in every segment": "{ a: 1, t: `\\x41\\n${a}\\u0042\\`${a}\\${a}` }",
	"multi-line template (LF)": "{\n  a: 1,\n  t: `line1\n${a}\nline3${\na\n}\n`\n}",
	"multi-line template (CRLF)": "{\r\n  a: 1,\r\n  t: `line1\r\n${a}\r\nline3${\r\na\r\n}\r\n`\r\n}",
	"multi-line template (lone CR, U+2028, U+2029)": "{ a: 1, t: `x\r${a} y${a} z` }",
	"templates as array elements": "[`${1}`, `a${`b`}c`, `plain`]"
};

/**
 * Braces inside an interpolation (issue #50). Object and array literals are
 * rejected there, but only the } that balances `${` ends the interpolation, so
 * the tokens and quasis still tile the source.
 */
const rejectedCases = {
	"object literal inside an interpolation (issue #50 reproduction)": "{ t: `x${ {b:1} }y` }",
	"array literal inside an interpolation": "{ t: `x${ [1] }y` }",
	"array containing an object": "{ t: `x${ [ {a: 1}, {b: [2]} ] }y` }",
	"template inside an object inside a template": "{ a: 1, t: `x${ {b: `q${a}r`} }y${a}z` }",
	"deeply nested braces": "{ a: 1, t: `<${ {a: {b: {c: {d: {e: 1}}}}} }|${a}>` }",
	"empty object and array, then a middle": "{ a: 1, t: `${ {} }-${ [] }-${a}` }",
	"multi-line object literal (CRLF)": "{\r\n  a: 1,\r\n  t: `x${ {\r\n    b: {c: 1}\r\n  } }y`\r\n}"
};

const allCases = [
	...Object.entries(cases).map(([name, text]) => [name, text, false]),
	...Object.entries(rejectedCases).map(([name, text]) => [name, text, true])
];

describe("template token and quasi spans tile the source (issue #47)", () => {
	describe.each(allCases)("%s", (_name, text, rejected) => {
		test("token slices plus the whitespace between them reproduce the input", () => {
			const { spans } = parse(text, rejected);

			let rebuilt = "";
			let cursor = 0;
			for (const span of spans) {
				const { start, end } = span.loc;
				expect(start.offset).toBeGreaterThanOrEqual(cursor); // ascending and non-overlapping
				const gap = text.slice(cursor, start.offset);
				expect(gap).toMatch(WHITESPACE_ONLY);
				rebuilt += gap + text.slice(start.offset, end.offset);
				cursor = end.offset;
			}
			const trailing = text.slice(cursor);
			expect(trailing).toMatch(WHITESPACE_ONLY);
			rebuilt += trailing;

			expect(rebuilt).toBe(text);
		});

		test("no non-whitespace character falls outside every token", () => {
			const { spans } = parse(text, rejected);
			const uncovered = [];
			for (let i = 0; i < text.length; i++) {
				if (WHITESPACE_ONLY.test(text[i])) continue;
				if (!spans.some((s) => s.loc.start.offset <= i && i < s.loc.end.offset)) {
					uncovered.push({ offset: i, char: text[i] });
				}
			}
			expect(uncovered).toEqual([]);
		});

		test("every token's raw and line/column agree with its offsets", () => {
			const { tokens } = parse(text, rejected);
			for (const token of tokens) {
				expect(token.loc.start).toEqual(positionAt(text, token.loc.start.offset));
				expect(token.loc.end).toEqual(positionAt(text, token.loc.end.offset));
				expect(token.raw).toBe(sliceOf(text, token.loc));
			}
		});

		test("each quasi's span and raw text match its template token", () => {
			const { program, tokens } = parse(text, rejected);
			const byStart = new Map(tokens.map((t) => [t.loc.start.offset, t]));
			const templates = templatesIn(program);

			for (const template of templates) {
				const { quasis, expressions } = template;
				expect(quasis.length).toBe(expressions.length + 1);

				quasis.forEach((quasi, i) => {
					const token = byStart.get(quasi.loc.start.offset);
					const expectedType =
						i === 0 ? TokenType.TEMPLATE_HEAD : i === quasis.length - 1 ? TokenType.TEMPLATE_TAIL : TokenType.TEMPLATE_MIDDLE;

					expect(token?.type).toBe(expectedType);
					expect(quasi.loc).toEqual(token.loc);
					expect(quasi.value.raw).toBe(token.raw);
					expect(quasi.value.raw).toBe(sliceOf(text, quasi.loc));
					expect(quasi.value.cooked).toBe(token.value);
					expect(quasi.tail).toBe(i === quasis.length - 1);

					// Delimiters: head opens with ` , middle/tail open with the closing },
					// head/middle end with ${ and the tail ends with the closing `.
					expect(quasi.value.raw.startsWith(i === 0 ? "`" : "}")).toBe(true);
					expect(quasi.value.raw.endsWith(quasi.tail ? "`" : "${")).toBe(true);
				});

				// Quasis and expressions alternate with only whitespace/comments between them.
				expressions.forEach((expr, i) => {
					expect(quasis[i].loc.end.offset).toBeLessThanOrEqual(expr.loc.start.offset);
					expect(expr.loc.end.offset).toBeLessThanOrEqual(quasis[i + 1].loc.start.offset);
				});

				expect(template.loc.start).toEqual(quasis[0].loc.start);
				expect(template.loc.end).toEqual(quasis.at(-1).loc.end);
			}
		});
	});

	test("the issue #47 reproduction yields a tail token and quasi starting at the closing }", () => {
		const text = "{ host: 'x', url: `http://${host}/path` }";
		const { tokens, program } = parse(text);

		const summary = tokens.map((t) => [t.type, t.loc.start.offset, t.loc.end.offset, t.raw]);
		expect(summary).toEqual([
			[TokenType.LBRACE, 0, 1, "{"],
			[TokenType.IDENTIFIER, 2, 6, "host"],
			[TokenType.COLON, 6, 7, ":"],
			[TokenType.STRING, 8, 11, "'x'"],
			[TokenType.COMMA, 11, 12, ","],
			[TokenType.IDENTIFIER, 13, 16, "url"],
			[TokenType.COLON, 16, 17, ":"],
			[TokenType.TEMPLATE_HEAD, 18, 28, "`http://${"],
			[TokenType.IDENTIFIER, 28, 32, "host"],
			[TokenType.TEMPLATE_TAIL, 32, 39, "}/path`"],
			[TokenType.RBRACE, 40, 41, "}"]
		]);

		const { quasis } = program.body.properties[1].value;
		expect(quasis.map((q) => [q.loc.start.offset, q.loc.end.offset, q.value.raw, q.value.cooked, q.tail])).toEqual([
			[18, 28, "`http://${", "http://", false],
			[32, 39, "}/path`", "/path", true]
		]);
	});

	test("middle and tail tokens start at the } on the line where it appears (CRLF)", () => {
		const text = "`a${\r\nx\r\n}b${\r\ny\r\n}c`";
		const { tokens } = parse(text);
		const middle = tokens.find((t) => t.type === TokenType.TEMPLATE_MIDDLE);
		const tail = tokens.find((t) => t.type === TokenType.TEMPLATE_TAIL);

		expect(middle.raw).toBe("}b${");
		expect(middle.loc).toEqual({ start: pos(3, 0, 9), end: pos(3, 4, 13) });
		expect(tail.raw).toBe("}c`");
		expect(tail.loc).toEqual({ start: pos(5, 0, 18), end: pos(5, 3, 21) });
	});

	test("cooked values exclude the delimiters while raw keeps them", () => {
		const { program } = parse("{ a: 1, t: `x${a}y${a}z` }");
		const { quasis } = program.body.properties[1].value;
		expect(quasis.map((q) => q.value.raw)).toEqual(["`x${", "}y${", "}z`"]);
		expect(quasis.map((q) => q.value.cooked)).toEqual(["x", "y", "z"]);
	});

	describe("error positions inside templates", () => {
		/** Run fn and return the error it throws. */
		function thrown(fn) {
			try {
				fn();
			} catch (err) {
				return err;
			}
			throw new Error("expected an error");
		}

		/** Parse with parseToAst and return its only collected error. */
		function collected(text) {
			const { errors } = parseToAst(text);
			expect(errors).toHaveLength(1);
			return errors[0];
		}

		test("an unterminated tail reports the end of input", () => {
			const text = "{ a: 1, t: `x${a}yz }";
			const err = collected(text);
			expect(err.code).toBe("UNTERMINATED_TEMPLATE");
			expect(err.loc).toEqual({ start: pos(1, 21, 21), end: pos(1, 21, 21) });
			expect(thrown(() => parseWithOptions(text)).code).toBe("UNTERMINATED_TEMPLATE");
		});

		test("an unterminated middle on a later line reports the end of input", () => {
			const text = "`x${a}\r\ny${a}z";
			const err = collected(text);
			expect(err.code).toBe("UNTERMINATED_TEMPLATE");
			expect(err.loc.start).toEqual(pos(2, 6, text.length));
		});

		test("an invalid escape in a tail segment points into that segment", () => {
			const text = "{ a: 1, t: `x${a}\\u{zz}` }";
			const err = collected(text);
			expect(err.code).toBe("INVALID_UNICODE_ESCAPE");
			expect(err.loc.start).toEqual(pos(1, 19, 19));
		});

		test("a missing } after an interpolation points at the unexpected token", () => {
			const text = "{ a: 1, t: `x${a b}` }";
			const { errors } = parseToAst(text);
			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe("Expected template middle or template tail");
			expect(errors[0].loc).toEqual({ start: pos(1, 17, 17), end: pos(1, 18, 18) });
		});
	});

	test("evaluated template values are unaffected by the delimiters in raw", () => {
		expect(parseWithOptions("{ a: 1, t: `x${a}y${a}z` }")).toEqual({ a: 1, t: "x1y1z" });
		expect(parseWithOptions("{ a: 1, b: 2, t: `${a}${b}` }")).toEqual({ a: 1, b: 2, t: "12" });
		expect(parseWithOptions("{ a: 1, t: `}{$${a}}$}{` }")).toEqual({ a: 1, t: "}{$1}$}{" });
	});
});
