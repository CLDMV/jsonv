/**
 * Tests for GitHub issue #50: only the } that balances a template's `${` ends
 * the interpolation, and object/array literals inside `${}` are rejected with
 * a positioned UNSUPPORTED_INTERPOLATION error instead of a misleading
 * "Expected ',' or '}'" (objects) or "Unresolved reference: <template>" (arrays).
 */

import { describe, test, expect } from "vitest";
import { parse, parseWithOptions, parseToAst, JsonvSyntaxError } from "../src/index.mjs";
import JSONV2015 from "../src/years/2015.mjs";
import { Lexer } from "../src/lexer/lexer.mjs";
import { TokenType } from "../src/lexer/lexer-types.mjs";

/** Build a Position literal. */
const pos = (line, column, offset) => ({ line, column, offset });

/**
 * Run `fn` and return the error it throws, failing the test if it does not throw.
 * @param {() => unknown} fn
 * @returns {any}
 */
function thrown(fn) {
	try {
		fn();
	} catch (err) {
		return err;
	}
	return expect.fail("expected a throw");
}

/** Token types and raw text, without EOF. */
const lex = (text) =>
	new Lexer(text, { year: 2015 })
		.tokenize()
		.filter((t) => t.type !== TokenType.EOF)
		.map((t) => [t.type, t.raw]);

const OBJECT_MESSAGE = "Object literals are not supported in template interpolation";
const ARRAY_MESSAGE = "Array literals are not supported in template interpolation";

describe("brace balancing inside template interpolations (issue #50)", () => {
	describe("lexer", () => {
		test("the } closing an object literal is an RBRACE, not the start of the tail", () => {
			expect(lex("`x${ {b:1} }y`")).toEqual([
				[TokenType.TEMPLATE_HEAD, "`x${"],
				[TokenType.LBRACE, "{"],
				[TokenType.IDENTIFIER, "b"],
				[TokenType.COLON, ":"],
				[TokenType.NUMBER, "1"],
				[TokenType.RBRACE, "}"],
				[TokenType.TEMPLATE_TAIL, "}y`"]
			]);
		});

		test("an array containing an object", () => {
			expect(lex("`x${ [{a:1}] }y`")).toEqual([
				[TokenType.TEMPLATE_HEAD, "`x${"],
				[TokenType.LBRACKET, "["],
				[TokenType.LBRACE, "{"],
				[TokenType.IDENTIFIER, "a"],
				[TokenType.COLON, ":"],
				[TokenType.NUMBER, "1"],
				[TokenType.RBRACE, "}"],
				[TokenType.RBRACKET, "]"],
				[TokenType.TEMPLATE_TAIL, "}y`"]
			]);
		});

		test("a template inside an object inside a template keeps each level's braces apart", () => {
			expect(lex("`x${ {b: `q${a}r`} }y${a}z`")).toEqual([
				[TokenType.TEMPLATE_HEAD, "`x${"],
				[TokenType.LBRACE, "{"],
				[TokenType.IDENTIFIER, "b"],
				[TokenType.COLON, ":"],
				[TokenType.TEMPLATE_HEAD, "`q${"],
				[TokenType.IDENTIFIER, "a"],
				[TokenType.TEMPLATE_TAIL, "}r`"],
				[TokenType.RBRACE, "}"],
				[TokenType.TEMPLATE_MIDDLE, "}y${"],
				[TokenType.IDENTIFIER, "a"],
				[TokenType.TEMPLATE_TAIL, "}z`"]
			]);
		});

		test("an object inside a template inside an object inside a template", () => {
			const types = lex("`1${ {a: `2${ {b: {}} }2`} }1`").map(([type]) => type);
			expect(types).toEqual([
				TokenType.TEMPLATE_HEAD,
				TokenType.LBRACE,
				TokenType.IDENTIFIER,
				TokenType.COLON,
				TokenType.TEMPLATE_HEAD,
				TokenType.LBRACE,
				TokenType.IDENTIFIER,
				TokenType.COLON,
				TokenType.LBRACE,
				TokenType.RBRACE,
				TokenType.RBRACE,
				TokenType.TEMPLATE_TAIL,
				TokenType.RBRACE,
				TokenType.TEMPLATE_TAIL
			]);
		});

		test("deeply nested braces close only at the balancing }", () => {
			const text = "`<${ {a:{b:{c:{d:{e:1}}}}} }|${x}>`";
			const tokens = lex(text);
			expect(tokens.filter(([type]) => type === TokenType.LBRACE)).toHaveLength(5);
			expect(tokens.filter(([type]) => type === TokenType.RBRACE)).toHaveLength(5);
			expect(tokens.slice(-3)).toEqual([
				[TokenType.TEMPLATE_MIDDLE, "}|${"],
				[TokenType.IDENTIFIER, "x"],
				[TokenType.TEMPLATE_TAIL, "}>`"]
			]);
		});

		test("braces outside any template are unaffected after a template closes", () => {
			expect(lex("{ t: `${ {} }`, o: { p: 1 } }").map(([type]) => type)).toEqual([
				TokenType.LBRACE,
				TokenType.IDENTIFIER,
				TokenType.COLON,
				TokenType.TEMPLATE_HEAD,
				TokenType.LBRACE,
				TokenType.RBRACE,
				TokenType.TEMPLATE_TAIL,
				TokenType.COMMA,
				TokenType.IDENTIFIER,
				TokenType.COLON,
				TokenType.LBRACE,
				TokenType.IDENTIFIER,
				TokenType.COLON,
				TokenType.NUMBER,
				TokenType.RBRACE,
				TokenType.RBRACE
			]);
		});

		test("an interpolation left open by an unbalanced { is an unterminated template", () => {
			// The } balances the inner {, so the interpolation never closes and the
			// following backtick opens a new, unterminated template.
			const err = thrown(() => new Lexer("`x${ { }`", { year: 2015 }).tokenize());
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err.code).toBe("UNTERMINATED_TEMPLATE");
		});
	});

	describe("object and array literals are rejected at the literal", () => {
		test("the issue #50 reproduction reports the object literal, not a misread }", () => {
			const text = "{ t: `x${ {b:1} }y` }";
			const err = thrown(() => parseWithOptions(text, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err.code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(err.message).toBe(`${OBJECT_MESSAGE} at line 1, column 10`);
			expect(err.loc).toEqual({ start: pos(1, 10, 10), end: pos(1, 15, 15) });
			expect([err.line, err.column, err.offset]).toEqual([1, 10, 10]);
		});

		test("the array reproduction from the issue comment reports the array literal", () => {
			const text = "{ t: `x${ [1] }y` }";
			const err = thrown(() => parseWithOptions(text, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err.code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(err.message).toBe(`${ARRAY_MESSAGE} at line 1, column 10`);
			expect(err.loc).toEqual({ start: pos(1, 10, 10), end: pos(1, 13, 13) });
		});

		test("every parse entry point rejects them", () => {
			for (const fn of [() => parse("`${ {} }`"), () => JSONV2015.parse("`${ {} }`"), () => parseWithOptions("`${ [] }`")]) {
				expect(thrown(fn).code).toBe("UNSUPPORTED_INTERPOLATION");
			}
		});

		test("an array containing an object is reported at the array", () => {
			const text = "{ t: `x${ [ {a: 1} ] }y` }";
			const { errors } = parseToAst(text);
			expect(errors).toMatchObject([
				{ message: ARRAY_MESSAGE, code: "UNSUPPORTED_INTERPOLATION", loc: { start: pos(1, 10, 10), end: pos(1, 20, 20) } }
			]);
		});

		test("a template inside an object inside a template is reported at the object", () => {
			const text = "{ a: 1, t: `x${ {b: `q${a}r`} }y${a}z` }";
			const { errors, program } = parseToAst(text);
			const start = text.indexOf("{b");
			const end = text.indexOf("} }y") + 1;
			expect(errors).toMatchObject([
				{ message: OBJECT_MESSAGE, code: "UNSUPPORTED_INTERPOLATION", loc: { start: pos(1, start, start), end: pos(1, end, end) } }
			]);

			// The rest of the template still parses: a nested object, a middle and a tail.
			const template = program.body.properties[1].value;
			expect(template.expressions.map((e) => e.type)).toEqual(["ObjectExpression", "Identifier"]);
			expect(template.quasis.map((q) => q.value.cooked)).toEqual(["x", "y", "z"]);
		});

		test("deeply nested braces are reported at the outermost literal", () => {
			const text = "{ a: 1, t: `<${ {a: {b: {c: {d: {e: 1}}}}} }|${a}>`, after: 2 }";
			const { errors } = parseToAst(text, { tolerant: true });
			const start = text.indexOf("{a:");
			const end = text.indexOf("}}}}}") + 5;
			expect(errors).toMatchObject([
				{ message: OBJECT_MESSAGE, code: "UNSUPPORTED_INTERPOLATION", loc: { start: pos(1, start, start), end: pos(1, end, end) } }
			]);
		});

		test("a multi-line literal is positioned on its own line", () => {
			const text = "{\n  t: `x${\n    {\n      b: 1\n    }\n  }y`\n}";
			const err = thrown(() => parseWithOptions(text));
			expect(err.code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(err.loc.start).toEqual(pos(3, 4, text.indexOf("{\n      b")));
			expect(err.loc.end).toEqual(pos(5, 5, text.indexOf("}\n  }y") + 1));
			expect(err.message).toBe(`${OBJECT_MESSAGE} at line 3, column 4`);
		});

		test("in a nested template the inner literal is reported", () => {
			const text = "{ t: `a${ `b${ [1] }c` }d` }";
			const err = thrown(() => parseWithOptions(text));
			expect(err.message).toBe(`${ARRAY_MESSAGE} at line 1, column ${text.indexOf("[")}`);
		});

		test("tolerant mode collects one error per literal, in source order, and keeps parsing", () => {
			const text = "{ t: `${ {} }-${ [] }-${ 1 }`, u: `${ [{}] }`, v: 3 }";
			const { errors, program } = parseToAst(text, { tolerant: true });
			expect(errors.map((e) => [e.message, e.loc.start.offset])).toEqual([
				[OBJECT_MESSAGE, text.indexOf("{}")],
				[ARRAY_MESSAGE, text.indexOf("[]")],
				[ARRAY_MESSAGE, text.indexOf("[{")]
			]);
			expect(program.body.properties.map((p) => p.key.name)).toEqual(["t", "u", "v"]);
		});

		test("the rejection comes before errors from inside the literal", () => {
			const text = "{ t: `x${ {b:1 2} }y` }";

			// Fail fast: the literal itself is the first problem in the source.
			const err = thrown(() => parseWithOptions(text));
			expect(err.code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(err.loc.start).toEqual(pos(1, 10, 10));
			expect(parseToAst(text).errors).toHaveLength(1);

			// Tolerant: the rejection is inserted ahead of the inner errors.
			const { errors } = parseToAst(text, { tolerant: true });
			expect(errors[0].code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(errors[1]).toMatchObject({ code: "PARSE_ERROR", message: "Expected ',' or '}' in object" });
			expect(errors.map((e) => e.loc.start.offset)).toEqual([...errors.map((e) => e.loc.start.offset)].sort((a, b) => a - b));
		});

		test("an earlier error still stops a fail-fast parse", () => {
			// An unsafe integer under strictBigInt is reported without derailing the
			// parse, so the template after it is still parsed.
			const text = "{ big: 9007199254740993, t: `${ {} }` }";
			const { errors, program } = parseToAst(text, { strictBigInt: true });
			expect(program.body.properties[1].value.expressions[0].type).toBe("ObjectExpression");
			expect(errors).toHaveLength(1);
			expect(errors[0].code).toBe("PARSE_ERROR");
			expect(errors[0].loc.start.offset).toBe(text.indexOf("9007"));

			// Tolerant mode reports both, in source order.
			const tolerant = parseToAst(text, { strictBigInt: true, tolerant: true }).errors;
			expect(tolerant.map((e) => e.code)).toEqual(["PARSE_ERROR", "UNSUPPORTED_INTERPOLATION"]);
		});
	});

	describe("supported interpolations are unchanged", () => {
		test("references, nested templates and scalar literals still evaluate", () => {
			const text = "{ a: [1, 2], o: { k: 1 }, t: `${a}|${o.k}|${ `n${o.k}` }|${true}|${null}|${1.5}|${'s'}|${10n}` }";
			expect(parseWithOptions(text).t).toBe("1,2|1|n1|true|null|1.5|s|10");
		});

		test("a reference to an object value stringifies with JS template semantics", () => {
			expect(parseWithOptions("{ o: { k: 1 }, t: `${o}` }").t).toBe("[object Object]");
		});

		test("braces in template text are still text", () => {
			expect(parseWithOptions("{ a: 1, t: `{${a}}` }").t).toBe("{1}");
		});
	});
});
