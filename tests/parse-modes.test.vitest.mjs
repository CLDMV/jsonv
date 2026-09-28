/**
 * Parse modes (issue #52): `mode: "json"` accepts exactly RFC 8259 JSON,
 * `mode: "json5"` accepts exactly JSON5 1.0, and `mode: "jsonv"` keeps every
 * jsonv feature. A feature outside the mode is rejected with a positioned
 * JsonvSyntaxError whose code is FEATURE_NOT_ALLOWED_IN_MODE.
 */

import { describe, test, expect } from "vitest";
import { parseWithOptions, parseToAst, JsonvSyntaxError } from "../src/parser.mjs";
import JSONV, { parse, parseWithOptions as indexParseWithOptions } from "../src/index.mjs";
import * as api2011 from "../src/years/2011.mjs";
import * as api2015 from "../src/years/2015.mjs";
import * as api2020 from "../src/years/2020.mjs";
import * as api2021 from "../src/years/2021.mjs";
import { Lexer } from "../src/lexer/lexer.mjs";

const CODE = "FEATURE_NOT_ALLOWED_IN_MODE";
const LABELS = { json: "JSON", json5: "JSON5" };

/** Accepted, evaluating to `value` */
const ok = (value) => ({ value });
/** Rejected by the lexer (thrown everywhere, including parseToAst) at a single-line offset */
const lx = (feature, offset) => ({ feature, offset, layer: "lexer" });
/** Rejected by the parser (collected in parseToAst errors) at a single-line offset */
const ps = (feature, offset) => ({ feature, offset, layer: "parser" });

/**
 * Mode x feature matrix. Every source is a single line, so an error at
 * `offset` is at line 1, column `offset`.
 */
const MATRIX = [
	// Rows from the issue
	["unquoted key", "{ a: 1 }", ps("Unquoted keys", 2), ok({ a: 1 }), ok({ a: 1 })],
	["single quotes", "'x'", lx("Single-quoted strings", 0), ok("x"), ok("x")],
	["trailing comma (object)", '{"a":1,}', ps("Trailing commas", 6), ok({ a: 1 }), ok({ a: 1 })],
	["trailing comma (array)", "[1,]", ps("Trailing commas", 2), ok([1]), ok([1])],
	["hex", "0xFF", lx("Hexadecimal literals", 0), ok(255), ok(255)],
	["Infinity", "Infinity", ps("Infinity", 0), ok(Infinity), ok(Infinity)],
	["line comment", "// c\n1", lx("Comments", 0), ok(1), ok(1)],
	["block comment", "[1, /* c */ 2]", lx("Comments", 4), ok([1, 2]), ok([1, 2])],
	["internal reference", '{"a": 1, "b": a}', ps("Internal references", 14), ps("Internal references", 14), ok({ a: 1, b: 1 })],
	["template", '{"a": 1, "b": `x${a}`}', lx("Template literals", 14), lx("Template literals", 14), ok({ a: 1, b: "x1" })],
	["binary", "0b1", lx("Binary literals", 0), lx("Binary literals", 0), ok(1)],
	["BigInt", "1n", lx("BigInt literals", 1), lx("BigInt literals", 1), ok(1n)],
	["numeric separator", "1_000", lx("Numeric separators", 1), lx("Numeric separators", 1), ok(1000)],

	// Other JSON5 features (rejected in JSON only)
	["-Infinity", "-Infinity", lx("Infinity", 0), ok(-Infinity), ok(-Infinity)],
	["+Infinity", "+Infinity", lx("Leading '+' sign", 0), ok(Infinity), ok(Infinity)],
	["NaN", "NaN", ps("NaN", 0), ok(NaN), ok(NaN)],
	["-NaN", "-NaN", lx("NaN", 0), ok(NaN), ok(NaN)],
	["+NaN", "+NaN", lx("Leading '+' sign", 0), ok(NaN), ok(NaN)],
	["negative hex", "-0xF", lx("Hexadecimal literals", 0), ok(-15), ok(-15)],
	["leading +", "+1", lx("Leading '+' sign", 0), ok(1), ok(1)],
	["leading decimal point", ".5", lx("Leading decimal point", 0), ok(0.5), ok(0.5)],
	["negative leading decimal point", "-.5", lx("Leading decimal point", 1), ok(-0.5), ok(-0.5)],
	["trailing decimal point", "5.", lx("Trailing decimal point", 1), ok(5), ok(5)],
	["trailing decimal point + exponent", "[0, 5.e2]", lx("Trailing decimal point", 5), ok([0, 500]), ok([0, 500])],
	["keyword key", "{ null: 1 }", ps("Unquoted keys", 2), ok({ null: 1 }), ok({ null: 1 })],
	["Unicode identifier key", "{ \u00fcmlaut: 1 }", ps("Unquoted keys", 2), ok({ "\u00fcmlaut": 1 }), ok({ "\u00fcmlaut": 1 })],
	["escaped identifier key", "{ \\u0061b: 1 }", ps("Unquoted keys", 2), ok({ ab: 1 }), ok({ ab: 1 })],
	["escape \\'", '"\\\'"', lx("Escape sequence '\\''", 1), ok("'"), ok("'")],
	["escape \\v", '"\\v"', lx("Escape sequence '\\v'", 1), ok("\v"), ok("\v")],
	["escape \\0", '"\\0"', lx("Escape sequence '\\0'", 1), ok("\0"), ok("\0")],
	["escape \\x", '"\\x41"', lx("Escape sequence '\\x'", 1), ok("A"), ok("A")],
	["identity escape \\A", '"\\A"', lx("Escape sequence '\\A'", 1), ok("A"), ok("A")],
	["line continuation (LF)", '"a\\\nb"', lx("Line continuations", 2), ok("ab"), ok("ab")],
	["line continuation (CRLF)", '"a\\\r\nb"', lx("Line continuations", 2), ok("ab"), ok("ab")],
	["line continuation (U+2028)", '"a\\\u2028b"', lx("Line continuations", 2), ok("ab"), ok("ab")],
	["raw tab in string", '"a\tb"', lx("Unescaped control character U+0009 in strings", 2), ok("a\tb"), ok("a\tb")],
	["raw U+2028 in string", '"a\u2028b"', ok("a\u2028b"), ok("a\u2028b"), ok("a\u2028b")],
	["whitespace U+000B", "\u000b1", lx("Whitespace character U+000B", 0), ok(1), ok(1)],
	["whitespace U+000C", "1\u000c", lx("Whitespace character U+000C", 1), ok(1), ok(1)],
	["whitespace U+00A0", "[\u00a01]", lx("Whitespace character U+00A0", 1), ok([1]), ok([1])],
	["whitespace U+2028", "[1,\u20282]", lx("Whitespace character U+2028", 3), ok([1, 2]), ok([1, 2])],
	["byte order mark", "\ufeff1", lx("Whitespace character U+FEFF", 0), ok(1), ok(1)],

	// jsonv extensions (rejected in JSON and JSON5)
	[
		"member reference",
		'{"a": {"b": 1}, "c": a.b}',
		ps("Internal references", 21),
		ps("Internal references", 21),
		ok({ a: { b: 1 }, c: 1 })
	],
	["plain template", "`x`", lx("Template literals", 0), lx("Template literals", 0), ok("x")],
	["octal 0o", "0o7", lx("Octal literals", 0), lx("Octal literals", 0), ok(7)],
	["legacy octal", "0755", lx("Leading zeros (legacy octal literals)", 0), lx("Leading zeros (legacy octal literals)", 0), ok(493)],
	["leading zero", "08", lx("Leading zeros (legacy octal literals)", 0), lx("Leading zeros (legacy octal literals)", 0), ok(8)],
	["hex BigInt", "0xFFn", lx("Hexadecimal literals", 0), lx("BigInt literals", 4), ok(255n)],
	["hex separator", "0xF_F", lx("Hexadecimal literals", 0), lx("Numeric separators", 3), ok(255)],
	["fraction separator", "1.0_5", lx("Numeric separators", 3), lx("Numeric separators", 3), ok(1.05)],
	["exponent separator", "1e1_0", lx("Numeric separators", 3), lx("Numeric separators", 3), ok(1e10)],
	["numeric key", "{ 1: 2 }", ps("Numeric keys", 2), ps("Numeric keys", 2), ok({ 1: 2 })],
	["BigInt key", "{ 1n: 2 }", lx("BigInt literals", 3), lx("BigInt literals", 3), ok({ 1: 2 })],
	["escape \\1", '"\\1"', lx("Escape sequence '\\1'", 1), lx("Escape sequence '\\1'", 1), ok("1")],
	["escape \\0 + digit", '"\\01"', lx("Escape sequence '\\0'", 1), lx("Escape sequence '\\01'", 1), ok("\u00001")],
	// Raw LF and CR end a string in every mode (UNTERMINATED_STRING), so they are not mode rows
	["raw U+001F in string", '"a\u001fb"', lx("Unescaped control character U+001F in strings", 2), ok("a\u001fb"), ok("a\u001fb")]
];

const MODE_COLUMNS = ["json", "json5", "jsonv"];

/** Every matrix cell as { name, source, mode, expected } */
const CELLS = MATRIX.flatMap(([name, source, ...expected]) =>
	MODE_COLUMNS.map((mode, i) => ({ name, source, mode, expected: expected[i] }))
);
const REJECTED = CELLS.filter((c) => c.expected.feature);
const ACCEPTED = CELLS.filter((c) => !c.expected.feature);

/** Assert `fn` throws the mode error described by `cell` */
function expectModeError(fn, cell) {
	let error;
	try {
		fn();
	} catch (e) {
		error = e;
	}
	expect(error, `${cell.name} should be rejected in ${cell.mode} mode`).toBeInstanceOf(JsonvSyntaxError);
	expect(error.code).toBe(CODE);
	expect(error.message).toContain(`${cell.expected.feature} not allowed in ${LABELS[cell.mode]} mode`);
	expect([error.line, error.column, error.offset]).toEqual([1, cell.expected.offset, cell.expected.offset]);
}

describe("parse modes: feature matrix", () => {
	describe("parseWithOptions", () => {
		test.each(REJECTED.map((c) => [c.mode, c.name, c]))("%s rejects %s", (mode, _name, cell) => {
			expectModeError(() => parseWithOptions(cell.source, { mode }), cell);
		});

		test.each(ACCEPTED.map((c) => [c.mode, c.name, c]))("%s accepts %s", (mode, _name, cell) => {
			expect(parseWithOptions(cell.source, { mode })).toEqual(cell.expected.value);
		});
	});

	describe("parseToAst", () => {
		test.each(REJECTED.map((c) => [c.mode, c.name, c]))("%s rejects %s", (mode, _name, cell) => {
			if (cell.expected.layer === "lexer") {
				// Lexer-level errors are thrown, like every other lexical error
				expectModeError(() => parseToAst(cell.source, { mode }), cell);
				return;
			}
			// Parser-level errors are collected
			const { errors } = parseToAst(cell.source, { mode });
			expect(errors).toHaveLength(1);
			expect(errors[0].code).toBe(CODE);
			expect(errors[0].message).toBe(`${cell.expected.feature} not allowed in ${LABELS[mode]} mode`);
			expect(errors[0].loc.start).toEqual({ line: 1, column: cell.expected.offset, offset: cell.expected.offset });
		});

		test.each(ACCEPTED.map((c) => [c.mode, c.name, c]))("%s accepts %s", (mode, _name, cell) => {
			expect(parseToAst(cell.source, { mode }).errors).toEqual([]);
		});
	});

	// json/json5 results do not depend on the year: the mode check runs before any year check
	const ENTRY_POINTS = [
		["index parse(text, options)", (text, mode) => parse(text, { mode })],
		["default export parse(text, options)", (text, mode) => JSONV.parse(text, { mode })],
		["index parseWithOptions", (text, mode) => indexParseWithOptions(text, { mode })],
		...[
			["2011", api2011],
			["2015", api2015],
			["2020", api2020],
			["2021", api2021]
		].flatMap(([year, api]) => [
			[`${year} parse(text, options)`, (text, mode) => api.parse(text, { mode })],
			[`${year} parseWithOptions`, (text, mode) => api.parseWithOptions(text, { mode })]
		])
	];

	describe.each(ENTRY_POINTS)("%s", (_entry, run) => {
		test.each(REJECTED.map((c) => [c.mode, c.name, c]))("%s rejects %s", (mode, _name, cell) => {
			expectModeError(() => run(cell.source, mode), cell);
		});

		test.each(ACCEPTED.filter((c) => c.mode !== "jsonv").map((c) => [c.mode, c.name, c]))("%s accepts %s", (mode, _name, cell) => {
			expect(run(cell.source, mode)).toEqual(cell.expected.value);
		});
	});
});

describe("parse modes: valid core", () => {
	// RFC 8259 section 13 examples plus every JSON token form
	const JSON_DOCS = [
		`{
      "Image": {
          "Width":  800,
          "Height": 600,
          "Title":  "View from 15th Floor",
          "Thumbnail": {
              "Url":    "http://www.example.com/image/481989943",
              "Height": 125,
              "Width":  100
          },
          "Animated" : false,
          "IDs": [116, 943, 234, 38793]
        }
    }`,
		`[
        {
           "precision": "zip",
           "Latitude":  37.7668,
           "Longitude": -122.3959,
           "Address":   "",
           "City":      "SAN FRANCISCO",
           "State":     "CA",
           "Zip":       "94107",
           "Country":   "US"
        },
        {
           "precision": "zip",
           "Latitude":  37.371991,
           "Longitude": -122.026020,
           "Address":   "",
           "City":      "SUNNYVALE",
           "State":     "CA",
           "Zip":       "94085",
           "Country":   "US"
        }
    ]`,
		'"Hello world!"',
		"42",
		"true",
		"false",
		"null",
		'\t\r\n {"escapes": "\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\ud83d\\ude00", "numbers": [0, -0, 1, -1, 0.5, -0.5, 10.25, 1e5, 1E5, 1e+5, 1e-5, -1.5E-3], "empty": [{}, [], ""], "nested": {"a": {"b": [null, true, false]}}} \r\n',
		'"raw U+2028 \u2028 and U+2029 \u2029 and \u00e9 \ud83d\ude00"'
	];

	test.each(JSON_DOCS.map((doc, i) => [i, doc]))("JSON document %i parses identically to JSON.parse in every mode", (_i, doc) => {
		for (const mode of MODE_COLUMNS) {
			expect(parseWithOptions(doc, { mode })).toEqual(JSON.parse(doc));
		}
	});

	test("a large JSON document parses identically to JSON.parse in json mode", () => {
		const doc = JSON.stringify(
			{
				items: Array.from({ length: 500 }, (_, i) => ({
					id: i,
					name: `item ${i}\n"quoted"`,
					ratio: i / 7,
					tags: ["a", "b"],
					ok: i % 2 === 0,
					none: null
				}))
			},
			null,
			2
		);
		expect(parseWithOptions(doc, { mode: "json" })).toEqual(JSON.parse(doc));
	});

	// https://spec.json5.org/ section 1.2 example
	const KITCHEN_SINK = `{
  // comments
  unquoted: 'and you can quote me on that',
  singleQuotes: 'I can use "double quotes" here',
  lineBreaks: "Look, Mom! \\
No \\\\n's!",
  hexadecimal: 0xdecaf,
  leadingDecimalPoint: .8675309, andTrailing: 8675309.,
  positiveSign: +1,
  trailingComma: 'in objects', andIn: ['arrays',],
  "backwardsCompatible": "with JSON",
}`;

	test("the JSON5 kitchen sink parses in json5 mode and is rejected in json mode", () => {
		expect(parseWithOptions(KITCHEN_SINK, { mode: "json5" })).toEqual({
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
		expect(() => parseWithOptions(KITCHEN_SINK, { mode: "json" })).toThrow(/Comments not allowed in JSON mode/);
	});

	const JSON5_DOCS = [
		[
			"reserved-word keys",
			"{ true: 1, false: 2, null: 3, Infinity: 4, NaN: 5, if: 6 }",
			{ true: 1, false: 2, null: 3, Infinity: 4, NaN: 5, if: 6 }
		],
		[
			"identifier keys",
			"{ $a: 1, _b: 2, c1: 3, \u00fcmlaut: 4, \\u0061b: 5, a\\u0031: 6 }",
			{ $a: 1, _b: 2, c1: 3, "\u00fcmlaut": 4, ab: 5, a1: 6 }
		],
		["Unicode identifier parts", "{ a\u0301: 1, a\u200cb: 2, \u0100\u0660: 3 }", { "a\u0301": 1, "a\u200cb": 2, "\u0100\u0660": 3 }],
		["astral identifier key", `{ ${String.fromCodePoint(0x1d400)}x: 1 }`, { [`${String.fromCodePoint(0x1d400)}x`]: 1 }],
		["signed keywords", "[+Infinity, -Infinity, +NaN, -NaN]", [Infinity, -Infinity, NaN, NaN]],
		[
			"number forms",
			"[0, -0, +0, 5., .5, -.5, +.5, 5.e2, .5e-1, 1E+2, 0x1F, 0XaB, -0xF, +0x10]",
			[0, -0, 0, 5, 0.5, -0.5, 0.5, 500, 0.05, 100, 31, 171, -15, 16]
		],
		["escapes", "['\\x41\\u0042\\'\\\"\\0\\v\\b\\f\\n\\r\\t\\/\\\\\\A']", ["AB'\"\0\v\b\f\n\r\t/\\A"]],
		["line continuations", "['a\\\nb', 'c\\\rd', 'e\\\r\nf', 'g\\\u2028h', 'i\\\u2029j']", ["ab", "cd", "ef", "gh", "ij"]],
		["raw tab and U+2028/U+2029 in strings", "['a\tb', 'c\u2028d\u2029e']", ["a\tb", "c\u2028d\u2029e"]],
		["JSON5 whitespace", "\ufeff[\u000b1,\u000c2,\u00a03,\u20284,\u20295,\u20036\t]\r\n", [1, 2, 3, 4, 5, 6]],
		["comments everywhere", "/* a */ { // b\n k /* c */ : /* d */ 1 /* e */ , } // f", { k: 1 }],
		["duplicate keys (last wins)", "{ a: 1, a: 2 }", { a: 2 }]
	];

	test.each(JSON5_DOCS)("json5 accepts %s", (_name, doc, expected) => {
		expect(parseWithOptions(doc, { mode: "json5" })).toEqual(expected);
		// Every JSON5 document is also a jsonv document with the same value
		expect(parseWithOptions(doc, { mode: "jsonv" })).toEqual(expected);
	});
});

describe("parse modes: positions and error collection", () => {
	test("a parser-level mode error on a later line reports that line", () => {
		const doc = '{\n  "a": 1,\n  "b": [1, 2,],\n}';
		let error;
		try {
			parseWithOptions(doc, { mode: "json" });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(JsonvSyntaxError);
		expect(error.code).toBe(CODE);
		expect([error.line, error.column, error.offset]).toEqual([3, 12, 24]);
		expect(error.message).toBe("Trailing commas not allowed in JSON mode at line 3, column 12");
	});

	test("a lexer-level mode error on a later line reports that line", () => {
		const doc = '{\n  "a": 1,\n  "b": 0x10\n}';
		expect(() => parseWithOptions(doc, { mode: "json" })).toThrow(
			expect.objectContaining({ code: CODE, line: 3, column: 7, offset: 19, message: "Hexadecimal literals not allowed in JSON mode" })
		);
	});

	test("parseToAst collects every parser-level mode error in tolerant mode", () => {
		const { errors } = parseToAst("{ a: 1, b: a, 2: [3,], }", { mode: "json", tolerant: true });
		expect(errors.map((e) => [e.code, e.message, e.loc.start.offset])).toEqual([
			[CODE, "Unquoted keys not allowed in JSON mode", 2],
			[CODE, "Unquoted keys not allowed in JSON mode", 8],
			[CODE, "Internal references not allowed in JSON mode", 11],
			[CODE, "Numeric keys not allowed in JSON mode", 14],
			[CODE, "Trailing commas not allowed in JSON mode", 19],
			[CODE, "Trailing commas not allowed in JSON mode", 21]
		]);
	});

	test("parseToAst reports only the first mode error without tolerant", () => {
		const { program, errors } = parseToAst("{ a: 1, b: 2 }", { mode: "json" });
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Unquoted keys not allowed in JSON mode");
		// The AST is still built
		expect(program.body.properties).toHaveLength(2);
	});

	test("tolerant parseWithOptions does not throw for parser-level mode errors", () => {
		expect(parseWithOptions("[1, 2,]", { mode: "json", tolerant: true })).toEqual([1, 2]);
	});
});

describe("parse modes: invalid mode values", () => {
	const INVALID = ["yaml", "JSON", "", 5, {}, true];
	const CALLS = [
		["parseWithOptions", (mode) => parseWithOptions("1", { mode })],
		["parse(text, options)", (mode) => parse("1", { mode })],
		["parseToAst", (mode) => parseToAst("1", { mode })],
		["2011 parse", (mode) => api2011.parse("1", { mode })],
		["2011 parseWithOptions", (mode) => api2011.parseWithOptions("1", { mode })],
		["2021 parse", (mode) => api2021.parse("1", { mode })],
		["2021 parseWithOptions", (mode) => api2021.parseWithOptions("1", { mode })],
		["Lexer", (mode) => new Lexer("1", { mode })]
	];

	describe.each(CALLS)("%s", (_name, call) => {
		test.each(INVALID.map((m) => [String(m), m]))("throws TypeError for mode %s", (_label, mode) => {
			expect(() => call(mode)).toThrow(TypeError);
		});

		test("treats undefined and null as the default jsonv mode", () => {
			expect(() => call(undefined)).not.toThrow();
			expect(() => call(null)).not.toThrow();
		});
	});

	test("the TypeError names the value and the allowed modes", () => {
		expect(() => parseWithOptions("1", { mode: "yaml" })).toThrow('Invalid parse mode: "yaml" (expected "jsonv", "json5" or "json")');
		expect(() => parseWithOptions("1", { mode: 5 })).toThrow('Invalid parse mode: 5 (expected "jsonv", "json5" or "json")');
	});

	test("null mode parses jsonv", () => {
		expect(parseWithOptions("{ a: 1, b: a }", { mode: null })).toEqual({ a: 1, b: 1 });
	});
});

describe("parse modes: entry-point defaults", () => {
	test("year modules default to jsonv, so 2011 keeps internal references", () => {
		expect(api2011.parse("{ a: 1, b: a }")).toEqual({ a: 1, b: 1 });
		expect(() => api2011.parse("{ a: 1, b: a }", { mode: "json5" })).toThrow("Internal references not allowed in JSON5 mode");
	});

	test("year modules keep their year when options are passed to parse", () => {
		// 2011 has no binary literals, even with options
		expect(() => api2011.parse("0b1", { mode: "jsonv" })).toThrow("Binary literals not allowed in this year");
		expect(api2021.parse("1_000", { mode: "jsonv", year: 2011 })).toBe(1000);
	});

	test("parse still accepts a reviver function", () => {
		const double = (key, value) => (typeof value === "number" ? value * 2 : value);
		expect(parse("{ a: 1 }", double)).toEqual({ a: 2 });
		for (const api of [api2011, api2015, api2020, api2021]) {
			expect(api.parse("{ a: 1 }", double)).toEqual({ a: 2 });
		}
	});

	test("parse accepts a reviver inside the options object", () => {
		const double = (key, value) => (typeof value === "number" ? value * 2 : value);
		expect(parse('{"a": 1}', { mode: "json", reviver: double })).toEqual({ a: 2 });
		expect(api2015.parse('{"a": 1}', { mode: "json", reviver: double })).toEqual({ a: 2 });
	});

	test("parse without a second argument uses jsonv", () => {
		expect(parse("{ a: 1n, b: a }")).toEqual({ a: 1n, b: 1n });
	});
});

describe("jsonv identifiers and signed keywords", () => {
	test("Unicode identifiers work as keys and references", () => {
		expect(parseWithOptions("{ \u00fc: 1, b: \u00fc }")).toEqual({ "\u00fc": 1, b: 1 });
	});

	test("an identifier spelled with an escape is never a keyword", () => {
		expect(parseWithOptions('{ "true": 5, b: \\u0074rue }')).toEqual({ true: 5, b: 5 });
		expect(() => parseWithOptions('{ "true": 5, b: \\u0074rue }', { mode: "json5" })).toThrow(
			"Internal references not allowed in JSON5 mode"
		);
	});

	test("an escaped key keeps its raw spelling in the AST token and its decoded name on the node", () => {
		const { program, tokens } = parseToAst("{ \\u0061: 1 }");
		expect(program.body.properties[0].key.name).toBe("a");
		expect(tokens[1].raw).toBe("\\u0061");
	});

	test("an identifier escape must be \\uXXXX", () => {
		expect(() => parseWithOptions("{ \\x61: 1 }")).toThrow(
			expect.objectContaining({ code: "INVALID_IDENTIFIER_ESCAPE", message: "Invalid escape in identifier (expected \\uXXXX)", offset: 2 })
		);
	});

	test("an escaped identifier start must be a letter, $ or _", () => {
		expect(() => parseWithOptions("{ \\u0031a: 1 }")).toThrow(
			expect.objectContaining({
				code: "INVALID_IDENTIFIER_ESCAPE",
				message: "Escaped character 1 is not valid in an identifier",
				offset: 2
			})
		);
	});

	test("an escaped identifier part must be an identifier character", () => {
		expect(() => parseWithOptions("{ a\\u0020: 1 }")).toThrow(
			expect.objectContaining({
				code: "INVALID_IDENTIFIER_ESCAPE",
				message: "Escaped character U+0020 is not valid in an identifier",
				offset: 3
			})
		);
	});

	test("escaped non-ASCII identifier characters are accepted", () => {
		expect(parseWithOptions("{ \\u00fc\\u0301: 1 }")).toEqual({ "\u00fc\u0301": 1 });
	});

	test("a non-letter non-ASCII character is not an identifier start", () => {
		expect(() => parseWithOptions("{ \u0660: 1 }")).toThrow("Unexpected character");
	});

	test("a backslash before U+2028 or U+2029 is a line continuation in templates too", () => {
		expect(parseWithOptions("`a\\\u2028b\\\u2029c`")).toBe("abc");
	});

	test("a plus sign that starts no number is an unexpected character", () => {
		expect(() => parseWithOptions("+a")).toThrow(expect.objectContaining({ code: "UNEXPECTED_CHARACTER", offset: 0 }));
	});

	test("a sign must be followed by Infinity or NaN when not followed by a number", () => {
		expect(() => parseWithOptions("+Inf")).toThrow(
			expect.objectContaining({ code: "UNEXPECTED_TOKEN", message: "Unexpected identifier after plus: Inf" })
		);
		expect(() => parseWithOptions("-Nope")).toThrow(
			expect.objectContaining({ code: "UNEXPECTED_TOKEN", message: "Unexpected identifier after minus: Nope" })
		);
	});
});
