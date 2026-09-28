/**
 * Tests for GitHub issue #59: a `tolerant: true` parse that collected syntax
 * errors throws one aggregate `JsonvSyntaxError` listing all of them in source
 * order instead of evaluating the recovered document, and error recovery
 * resynchronizes on property / element boundaries so the text after an error
 * is not misread as internal references.
 */

import { describe, test, expect } from "vitest";
import JSONV, {
	parse,
	parseWithOptions,
	parseToAst,
	JsonvSyntaxError,
	JsonvReferenceError,
	JsonvAggregateSyntaxError
} from "../src/index.mjs";
import {
	parseWithOptions as parseWithOptionsFromParser,
	JsonvAggregateSyntaxError as AggregateFromParser,
	Parser
} from "../src/parser.mjs";
import { JsonvAggregateSyntaxError as AggregateFromErrors } from "../src/errors.mjs";
import { LexerError } from "../src/lexer/lexer-types.mjs";
import JSONV2011 from "../src/years/2011.mjs";
import JSONV2015 from "../src/years/2015.mjs";
import JSONV2020 from "../src/years/2020.mjs";
import JSONV2021 from "../src/years/2021.mjs";
import { loadYear } from "../src/years/loader.mjs";

const TOLERANT = { tolerant: true };

/** Run `fn`, fail if it does not throw, and return the thrown error. */
function thrown(fn) {
	try {
		fn();
	} catch (err) {
		return err;
	}
	throw new Error("expected the call to throw");
}

/** The position/code fields of an error, for compact comparison. */
function where(err) {
	return { line: err.line, column: err.column, offset: err.offset, code: err.code };
}

/** Every Identifier / MemberExpression used as a value (i.e. a reference) in an AST. */
function references(node, out = []) {
	if (!node || typeof node !== "object") {
		return out;
	}
	switch (node.type) {
		case "Identifier":
		case "MemberExpression":
			out.push(node);
			return out;
		case "ObjectExpression":
			for (const prop of node.properties) {
				references(prop.value, out);
			}
			return out;
		case "ArrayExpression":
			for (const el of node.elements) {
				references(el, out);
			}
			return out;
		case "TemplateLiteral":
			for (const expr of node.expressions) {
				references(expr, out);
			}
			return out;
		default:
			return out;
	}
}

/** Property key names of an object node. */
function keys(objectNode) {
	return objectNode.properties.map((p) => (p.key.type === "Identifier" ? p.key.name : String(p.key.value)));
}

describe("tolerant parse: aggregate syntax error (issue #59)", () => {
	describe("one syntax error", () => {
		test("{ a: 1,, b: 2 } throws the aggregate instead of 'Unresolved reference: b'", () => {
			const err = thrown(() => parseWithOptions("{ a: 1,, b: 2 }", TOLERANT));

			expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err).toBeInstanceOf(SyntaxError);
			expect(err).not.toBeInstanceOf(JsonvReferenceError);
			expect(err.name).toBe("SyntaxError");
			expect(err.message).toBe("Expected property key, got COMMA at line 1, column 7 (1 syntax error in total)");
			expect(where(err)).toEqual({ line: 1, column: 7, offset: 7, code: "PARSE_ERROR" });

			expect(err.errors).toHaveLength(1);
			expect(err.errors[0]).toBeInstanceOf(JsonvSyntaxError);
			expect(err.errors[0].message).toBe("Expected property key, got COMMA at line 1, column 7");
			expect(where(err.errors[0])).toEqual({ line: 1, column: 7, offset: 7, code: "PARSE_ERROR" });
			expect(err.errors[0].loc).toEqual({ start: { line: 1, column: 7, offset: 7 }, end: { line: 1, column: 8, offset: 8 } });
		});

		test("the collected error is the one a strict parse throws", () => {
			for (const text of ["{ a: 1,, b: 2 }", "[1 2]", "{ x 1 }", "{ x: 1, y: }", "{ a: 1, t: `x${a b}` }"]) {
				const strict = thrown(() => parseWithOptions(text));
				const tolerant = thrown(() => parseWithOptions(text, TOLERANT));

				expect(strict).not.toBeInstanceOf(JsonvAggregateSyntaxError);
				expect(tolerant.errors).toHaveLength(1);
				expect(tolerant.errors[0].message).toBe(strict.message);
				expect(where(tolerant.errors[0])).toEqual(where(strict));
				expect(where(tolerant)).toEqual(where(strict));
			}
		});

		test("the aggregate carries the first error's loc", () => {
			const err = thrown(() => parseWithOptions("[1 2]", TOLERANT));
			expect(err.loc).toEqual(err.errors[0].loc);
		});
	});

	describe("several syntax errors", () => {
		test("{ a: 1,, b: 2,, c: } lists all three errors in source order", () => {
			const err = thrown(() => parseWithOptions("{ a: 1,, b: 2,, c: }", TOLERANT));

			expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
			expect(err.message).toBe("Expected property key, got COMMA at line 1, column 7 (3 syntax errors in total)");
			expect(err.errors.map((e) => e.message)).toEqual([
				"Expected property key, got COMMA at line 1, column 7",
				"Expected property key, got COMMA at line 1, column 14",
				"Unexpected token: RBRACE at line 1, column 19"
			]);
			expect(err.errors.map(where)).toEqual([
				{ line: 1, column: 7, offset: 7, code: "PARSE_ERROR" },
				{ line: 1, column: 14, offset: 14, code: "PARSE_ERROR" },
				{ line: 1, column: 19, offset: 19, code: "PARSE_ERROR" }
			]);
			expect(where(err)).toEqual(where(err.errors[0]));
		});

		test("errors on several lines, in objects, arrays and templates, keep source order", () => {
			const text = ["{", "  a: [1 2, 3],", "  b: `x${a c}y`,", "  d e: 4,", "  f: 5,,", "  g: [,],", "}"].join("\n");
			const err = thrown(() => parseWithOptions(text, TOLERANT));

			expect(err.errors.map((e) => [e.line, e.column])).toEqual([
				[2, 8],
				[3, 11],
				[4, 4],
				[5, 7],
				[6, 6]
			]);
			const offsets = err.errors.map((e) => e.offset);
			expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
			expect(err.errors.every((e) => e instanceof JsonvSyntaxError && e.code === "PARSE_ERROR")).toBe(true);
			expect(err.message).toMatch(/at line 2, column 8 \(5 syntax errors in total\)$/);
		});

		test("the aggregate lists exactly parseToAst's tolerant errors", () => {
			const text = "{ a: 1,, b: [1 2, }, c: }";
			const err = thrown(() => parseWithOptions(text, TOLERANT));
			const { errors } = parseToAst(text, TOLERANT);

			expect(err.errors.map((e) => e.offset)).toEqual(errors.map((e) => e.loc.start.offset));
			expect(err.errors.map((e) => e.code)).toEqual(errors.map((e) => e.code));
		});
	});

	describe("the document is not evaluated", () => {
		test("no reference error for references in a document with syntax errors", () => {
			const err = thrown(() => parseWithOptions("{ a: missing,, b: other }", TOLERANT));
			expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
			expect(err.errors).toHaveLength(1);
		});

		test("the reviver is never called", () => {
			let calls = 0;
			const reviver = (key, value) => {
				calls++;
				return value;
			};
			expect(() => parseWithOptions("{ a: 1,, b: 2 }", { tolerant: true, reviver })).toThrow(JsonvAggregateSyntaxError);
			expect(calls).toBe(0);
		});

		test("a document with an error no longer yields a truncated value", () => {
			// Before #59, "[1 2, }" in tolerant mode silently returned [1].
			expect(() => parseWithOptions("[1 2, }", TOLERANT)).toThrow(JsonvAggregateSyntaxError);
		});
	});

	describe("lexical errors", () => {
		test("a lexer error in tolerant mode is reported through the aggregate", () => {
			const err = thrown(() => parseWithOptions('{ a: "open', TOLERANT));

			expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
			expect(err.errors).toHaveLength(1);
			expect(err.errors[0]).toBeInstanceOf(LexerError);
			expect(where(err)).toEqual(where(err.errors[0]));
			expect(err.message).toBe(`${err.errors[0].message} (1 syntax error in total)`);
		});

		test("a lexer error in strict mode is still thrown as the LexerError itself", () => {
			const err = thrown(() => parseWithOptions('{ a: "open'));
			expect(err).toBeInstanceOf(LexerError);
			expect(err).not.toBeInstanceOf(JsonvAggregateSyntaxError);
		});
	});
});

describe("tolerant recovery does not invent references (issue #59)", () => {
	test("{ a: 1,, b: 2 }: b is a key", () => {
		const { program, errors } = parseToAst("{ a: 1,, b: 2 }", TOLERANT);

		expect(errors).toHaveLength(1);
		expect(keys(program.body)).toEqual(["a", "b"]);
		expect(program.body.properties[1].value).toMatchObject({ type: "Literal", value: 2 });
		expect(references(program.body)).toEqual([]);
	});

	test("{ a: 1,, b: 2,, c: }: b and c are keys, the missing value is a placeholder", () => {
		const { program, errors } = parseToAst("{ a: 1,, b: 2,, c: }", TOLERANT);

		expect(errors).toHaveLength(3);
		expect(keys(program.body)).toEqual(["a", "b", "c"]);
		expect(program.body.properties[2].value).toMatchObject({ type: "Literal", value: null });
		expect(references(program.body)).toEqual([]);
	});

	test.each([
		["a missing colon", "{ a b: 1, c: 2 }", ["c"]],
		["a bracketed key", "{ a: 1, [x, y]: 2, b: 3 }", ["a", "b"]],
		["a nested bracketed key", "{ a: 1, [x, [y, z], { w: v }, `${t}m${u}`]: 2, b: 3 }", ["a", "b"]],
		["a stray colon key", "{ : x, b: 3 }", ["b"]],
		["a missing comma between properties", "{ a: 1 b: c, d: 4 }", ["a", "d"]]
	])("%s: %s", (_label, text, expectedKeys) => {
		const { program, errors } = parseToAst(text, TOLERANT);

		expect(errors).toHaveLength(1);
		expect(keys(program.body)).toEqual(expectedKeys);
		expect(references(program.body)).toEqual([]);
	});

	test("arrays resync on element boundaries", () => {
		const extraComma = parseToAst("[1,, 2]", TOLERANT);
		expect(extraComma.errors.map((e) => e.message)).toEqual(["Unexpected token: COMMA"]);
		expect(extraComma.program.body.elements.map((e) => e.value)).toEqual([1, null, 2]);

		const missingComma = parseToAst("[1 x, 3]", TOLERANT);
		expect(missingComma.errors.map((e) => e.message)).toEqual(["Expected ',' or ']' in array"]);
		expect(missingComma.program.body.elements.map((e) => e.value)).toEqual([1, 3]);
		expect(references(missingComma.program.body)).toEqual([]);
	});

	test("an interpolation error resyncs at the template's next middle or tail", () => {
		const { program, errors } = parseToAst("{ a: 1, t: `x${a b}y${a}z`, c: 2 }", TOLERANT);

		expect(errors).toHaveLength(1);
		expect(keys(program.body)).toEqual(["a", "t", "c"]);
		const template = program.body.properties[1].value;
		expect(template.quasis.map((q) => q.value.cooked)).toEqual(["x", "y", "z"]);
		expect(template.quasis.map((q) => q.tail)).toEqual([false, false, true]);
		expect(references(program.body).map((r) => r.name)).toEqual(["a", "a"]);
	});

	test("an interpolation error skips commas inside the interpolation", () => {
		const { program, errors } = parseToAst("{ t: `${a, b}`, c: 2 }", TOLERANT);

		expect(errors).toHaveLength(1);
		expect(keys(program.body)).toEqual(["t", "c"]);
		expect(references(program.body).map((r) => r.name)).toEqual(["a"]);
	});

	test("recovery that reaches EOF stops there", () => {
		const unterminated = parseToAst("{ a: 1 b", TOLERANT);
		expect(unterminated.errors.map((e) => e.message)).toEqual(["Expected ',' or '}' in object", "Expected RBRACE, got EOF"]);

		const template = parseToAst("`a${x y", TOLERANT);
		expect(template.errors.map((e) => e.message)).toEqual(["Expected template middle or template tail"]);
	});

	test("one error per position: enclosing constructs do not repeat it", () => {
		// Before #59 this reported the same `2` three times.
		expect(parseToAst("[1 2]", TOLERANT).errors.map((e) => e.loc.start.offset)).toEqual([3]);
		expect(parseToAst("{ a: 1 ] }", TOLERANT).errors.map((e) => e.message)).toEqual(["Expected ',' or '}' in object"]);
	});

	test("a lone bad key token followed by ':' still yields a positioned placeholder key", () => {
		const result = new Parser("{ [: 1, b: 2 }", TOLERANT).parse();
		expect(result.errors).toHaveLength(1);
		expect(result.program.body.properties.map((p) => (p.key.type === "Identifier" ? p.key.name : p.key.value))).toEqual(["error", "b"]);
	});
});

describe("tolerant mode without syntax errors matches strict mode (issue #59)", () => {
	const valid = [
		"{ a: 1, b: 2 }",
		"{ port: 8080, backup: port, nested: { host: 'h', ref: nested.host }, list: [1, 2, port] }",
		"{ host: 'h', port: 80, url: `http://${host}:${port}/` }",
		"{ big: 9007199254740993, n: 12n, hex: 0xff, bin: 0b101, oct: 0o7, sep: 1_000 }",
		"[1, 2, 3,]",
		"{ trailing: 1, }",
		"// comment\n{ /* inline */ a: 'x' }",
		"null"
	];

	test.each(valid)("%s", (text) => {
		expect(parseWithOptions(text, TOLERANT)).toEqual(parseWithOptions(text));
	});

	test("the reviver runs the same way", () => {
		const reviver = (key, value) => (typeof value === "number" ? value * 2 : value);
		const text = "{ a: 1, b: [2, 3], c: a }";
		expect(parseWithOptions(text, { tolerant: true, reviver })).toEqual(parseWithOptions(text, { reviver }));
	});

	test("a reference error in a syntactically valid document is still a JsonvReferenceError", () => {
		const strict = thrown(() => parseWithOptions("{ a: missing }"));
		const tolerant = thrown(() => parseWithOptions("{ a: missing }", TOLERANT));

		expect(tolerant).toBeInstanceOf(JsonvReferenceError);
		expect(tolerant.message).toBe(strict.message);
		expect(where(tolerant)).toEqual(where(strict));
	});

	test("parseToAst's tolerant and strict ASTs are identical", () => {
		for (const text of valid) {
			expect(parseToAst(text, TOLERANT)).toEqual(parseToAst(text));
		}
	});
});

describe("entry points (issue #59)", () => {
	const text = "{ a: 1,, b: 2,, c: }";
	const expectedOffsets = [7, 14, 19];

	const entryPoints = [
		["index parseWithOptions", (t, o) => parseWithOptions(t, o)],
		["default export parseWithOptions", (t, o) => JSONV.parseWithOptions(t, o)],
		["parser subpath parseWithOptions", (t, o) => parseWithOptionsFromParser(t, o)],
		["2011 parseWithOptions", (t, o) => JSONV2011.parseWithOptions(t, o)],
		["2015 parseWithOptions", (t, o) => JSONV2015.parseWithOptions(t, o)],
		["2020 parseWithOptions", (t, o) => JSONV2020.parseWithOptions(t, o)],
		["2021 parseWithOptions", (t, o) => JSONV2021.parseWithOptions(t, o)]
	];

	test.each(entryPoints)("%s throws the aggregate in tolerant mode", (_label, fn) => {
		const err = thrown(() => fn(text, TOLERANT));
		expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
		expect(err.errors.map((e) => e.offset)).toEqual(expectedOffsets);
	});

	test.each(entryPoints)("%s throws the first error only in strict mode", (_label, fn) => {
		const err = thrown(() => fn(text, {}));
		expect(err).toBeInstanceOf(JsonvSyntaxError);
		expect(err).not.toBeInstanceOf(JsonvAggregateSyntaxError);
		expect(err.offset).toBe(7);
	});

	test.each(entryPoints)("%s gives the strict result for valid input in tolerant mode", (_label, fn) => {
		expect(fn("{ a: 1, b: a, c: [a, b] }", TOLERANT)).toEqual(fn("{ a: 1, b: a, c: [a, b] }", {}));
	});

	test("a dynamically loaded year module throws the aggregate", async () => {
		const api = await loadYear(2015);
		const err = thrown(() => api.parseWithOptions(text, TOLERANT));
		expect(err).toBeInstanceOf(JsonvAggregateSyntaxError);
		expect(err.errors.map((e) => e.offset)).toEqual(expectedOffsets);
	});

	test.each([
		["index parse", (t) => parse(t)],
		["default export parse", (t) => JSONV.parse(t)],
		["2011 parse", (t) => JSONV2011.parse(t)],
		["2015 parse", (t) => JSONV2015.parse(t)],
		["2020 parse", (t) => JSONV2020.parse(t)],
		["2021 parse", (t) => JSONV2021.parse(t)]
	])("%s (never tolerant) throws the strict first error", (_label, fn) => {
		const err = thrown(() => fn(text));
		expect(err).toBeInstanceOf(JsonvSyntaxError);
		expect(err).not.toBeInstanceOf(JsonvAggregateSyntaxError);
		expect(err.message).toBe("Expected property key, got COMMA at line 1, column 7");
	});

	test("parseToAst keeps returning the collected errors without throwing", () => {
		const tolerant = parseToAst(text, TOLERANT);
		expect(tolerant.errors.map((e) => e.loc.start.offset)).toEqual(expectedOffsets);
		expect(tolerant.errors.every((e) => e.code === "PARSE_ERROR")).toBe(true);

		const strict = parseToAst(text);
		expect(strict.errors.map((e) => e.loc.start.offset)).toEqual([7]);
	});

	test("the aggregate class is exported from the package root, parser and errors modules", () => {
		expect(AggregateFromParser).toBe(JsonvAggregateSyntaxError);
		expect(AggregateFromErrors).toBe(JsonvAggregateSyntaxError);
	});
});
