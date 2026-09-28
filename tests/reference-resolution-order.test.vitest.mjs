/**
 * Tests for GitHub issue #54: internal references are resolved in dependency
 * order, not in a fixed number of passes. Any acyclic reference graph resolves
 * whatever its depth or key order -- through plain identifiers, member
 * expressions, templates and nested templates -- while true cycles and
 * undefined references still throw a positioned JsonvReferenceError.
 */

import { describe, test, expect, vi } from "vitest";
import JSONV, { parse, parseWithOptions, JsonvReferenceError } from "../src/index.mjs";
import JSONV2011 from "../src/years/2011.mjs";
import JSONV2015 from "../src/years/2015.mjs";
import JSONV2020 from "../src/years/2020.mjs";
import JSONV2021 from "../src/years/2021.mjs";
import { Parser } from "../src/parser.mjs";

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

/**
 * Build an object literal from `[key, source]` entries, in the given order.
 * @param {Array<[string, string]>} entries
 * @returns {string}
 */
function doc(entries) {
	return `{ ${entries.map(([key, source]) => `${key}: ${source}`).join(", ")} }`;
}

/**
 * Entries for a chain of `length` references: k0 -> k1 -> ... -> k<length>,
 * where `link(next)` is the source of a link to key `next` and the last key
 * holds `last`. `order` "forward" writes k0 first, so every reference points at
 * a later key; "reverse" writes k<length> first, so every reference points back.
 * @param {number} length
 * @param {(next: string) => string} link
 * @param {string} last
 * @param {"forward" | "reverse"} order
 * @returns {Array<[string, string]>}
 */
function chain(length, link, last, order) {
	const entries = [];
	for (let i = 0; i < length; i++) {
		entries.push([`k${i}`, link(`k${i + 1}`)]);
	}
	entries.push([`k${length}`, last]);
	return order === "forward" ? entries : entries.reverse();
}

/**
 * Expected result for a chain whose key `k<i>` evaluates to `valueAt(i)`.
 * @param {number} length
 * @param {(i: number) => unknown} valueAt
 * @returns {Record<string, unknown>}
 */
function expectedChain(length, valueAt) {
	const out = {};
	for (let i = 0; i <= length; i++) {
		out[`k${i}`] = valueAt(i);
	}
	return out;
}

const LENGTHS = Array.from({ length: 50 }, (_, i) => i + 1);
const ORDERS = ["forward", "reverse"];

// The generated-document and very-deep-chain tests parse documents of tens of
// thousands of keys; allow for slow, shared or coverage-instrumented runners.
const HEAVY = { timeout: 60000 };

describe("reference resolution order (issue #54)", () => {
	describe("the issue's reproduction", () => {
		test("chains of 3, 4 and 5 keys resolve", () => {
			expect(parseWithOptions("{ a: b, b: c, c: 1 }")).toEqual({ a: 1, b: 1, c: 1 });
			expect(parseWithOptions("{ a: b, b: c, c: d, d: 1 }")).toEqual({ a: 1, b: 1, c: 1, d: 1 });
			expect(parseWithOptions("{ a: b, b: c, c: d, d: e, e: 1 }")).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1 });
		});
	});

	describe("identifier chains", HEAVY, () => {
		test.each(ORDERS)("lengths 1-50 resolve in %s order", (order) => {
			for (const length of LENGTHS) {
				const input = doc(chain(length, (next) => next, "42", order));
				expect(parseWithOptions(input), `length ${length}`).toEqual(expectedChain(length, () => 42));
			}
		});

		test.each(ORDERS)("a chain of 10000 keys resolves in %s order", (order) => {
			const length = 10000;
			const result = parseWithOptions(doc(chain(length, (next) => next, "'end'", order)));
			expect(Object.keys(result)).toHaveLength(length + 1);
			expect(Object.values(result).every((value) => value === "end")).toBe(true);
		});

		test("keys in shuffled order resolve", () => {
			const entries = chain(50, (next) => next, "true", "forward");
			// Deterministic interleave: odd positions first, then even ones
			const shuffled = [...entries.filter((_, i) => i % 2), ...entries.filter((_, i) => !(i % 2))];
			expect(parseWithOptions(doc(shuffled))).toEqual(expectedChain(50, () => true));
		});
	});

	describe("member-expression chains", () => {
		test("the issue's example: a: b.x, b: { x: c }, c: 1", () => {
			expect(parseWithOptions("{ a: b.x, b: { x: c }, c: 1 }")).toEqual({ a: 1, b: { x: 1 }, c: 1 });
		});

		test.each(ORDERS)("lengths 1-50 of k<i>: { v: k<i+1>.v } resolve in %s order", (order) => {
			for (const length of LENGTHS) {
				const input = doc(chain(length, (next) => `{ v: ${next}.v }`, "{ v: 42 }", order));
				expect(parseWithOptions(input), `length ${length}`).toEqual(expectedChain(length, () => ({ v: 42 })));
			}
		});

		test.each(ORDERS)("a member path through a chain of 1-50 references resolves in %s order", (order) => {
			for (const length of LENGTHS) {
				const entries = chain(length, (next) => next, "{ x: { y: 5 } }", order);
				const input = doc([["m", "k0.x.y"], ...entries]);
				const expected = { m: 5, ...expectedChain(length, () => ({ x: { y: 5 } })) };
				expect(parseWithOptions(input), `length ${length}`).toEqual(expected);
			}
		});

		test("a member path whose intermediate key is itself a reference", () => {
			expect(parseWithOptions("{ a: b.x.y, b: c, c: { x: d }, d: { y: 'deep' } }")).toEqual({
				a: "deep",
				b: { x: { y: "deep" } },
				c: { x: { y: "deep" } },
				d: { y: "deep" }
			});
		});

		test("a member path through a reference whose target has marker-like key names", () => {
			expect(parseWithOptions("{ a: b.path, b: c, c: { path: 1, node: 2 } }")).toEqual({
				a: 1,
				b: { path: 1, node: 2 },
				c: { path: 1, node: 2 }
			});
		});

		test("a key whose target refers back into the referring key's own value (acyclic)", () => {
			expect(parseWithOptions("{ a: b, b: { x: 1, y: a.x } }")).toEqual({ a: { x: 1, y: 1 }, b: { x: 1, y: 1 } });
		});
	});

	describe("template chains", () => {
		test.each(ORDERS)("lengths 1-50 of templates resolve in %s order", (order) => {
			for (const length of LENGTHS) {
				const input = doc(chain(length, (next) => `\`<\${${next}}>\``, "'x'", order));
				const valueAt = (i) => "<".repeat(length - i) + "x" + ">".repeat(length - i);
				expect(parseWithOptions(input, { year: 2015 }), `length ${length}`).toEqual(expectedChain(length, valueAt));
			}
		});

		test.each(ORDERS)("lengths 1-50 of nested templates resolve in %s order", (order) => {
			for (const length of LENGTHS) {
				const input = doc(chain(length, (next) => `\`(\${ \`[\${${next}}]\` })\``, "0", order));
				const valueAt = (i) => (i === length ? 0 : "([".repeat(length - i) + "0" + "])".repeat(length - i));
				expect(parseWithOptions(input, { year: 2015 }), `length ${length}`).toEqual(expectedChain(length, valueAt));
			}
		});

		test.each(ORDERS)("lengths 1-50 mixing identifiers, member expressions and templates resolve in %s order", (order) => {
			for (const length of LENGTHS) {
				// Links cycle through identifier, member expression (via a helper key) and template
				const entries = [];
				const expected = {};
				for (let i = 0; i < length; i++) {
					const next = `k${i + 1}`;
					if (i % 3 === 1) {
						entries.push([`k${i}`, `h${i}.v`], [`h${i}`, `{ v: ${next} }`]);
						expected[`h${i}`] = { v: "end" };
					} else {
						entries.push([`k${i}`, i % 3 === 0 ? next : `\`\${${next}}\``]);
					}
					expected[`k${i}`] = "end";
				}
				entries.push([`k${length}`, "'end'"]);
				expected[`k${length}`] = "end";
				const input = doc(order === "forward" ? entries : entries.reverse());
				expect(parseWithOptions(input, { year: 2015 }), `length ${length}`).toEqual(expected);
			}
		});

		test("a template interpolating a forward chain", () => {
			expect(
				parseWithOptions(
					"{ url: `${host}:${port}`, host: h1, h1: h2, h2: h3, h3: h4, h4: 'db', port: p1, p1: p2, p2: p3, p3: p4, p4: 5432 }"
				)
			).toEqual({
				url: "db:5432",
				host: "db",
				h1: "db",
				h2: "db",
				h3: "db",
				h4: "db",
				port: 5432,
				p1: 5432,
				p2: 5432,
				p3: 5432,
				p4: 5432
			});
		});
	});

	describe("very deep chains", HEAVY, () => {
		test.each(ORDERS)("a chain of 10000 templates resolves in %s order", (order) => {
			const length = 10000;
			const result = parseWithOptions(doc(chain(length, (next) => `\`\${${next}}\``, "7", order)), { year: 2015 });
			expect(result.k0).toBe("7");
			expect(result[`k${length - 1}`]).toBe("7");
			expect(result[`k${length}`]).toBe(7);
		});

		test("a chain of 3000 alternating identifiers and nested templates resolves", () => {
			const length = 3000;
			const input = doc(chain(length, (next) => (next.slice(1) % 2 ? next : `\`\${ \`\${${next}}\` }\``), "'z'", "forward"));
			const result = parseWithOptions(input, { year: 2015 });
			expect(Object.values(result).every((value) => value === "z")).toBe(true);
		});

		test("a 3000-template chain ending in an undefined reference reports that reference", () => {
			const input = doc(chain(3000, (next) => `\`\${${next}}\``, "nowhere", "forward"));
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Unresolved reference: nowhere (circular reference or undefined)");
			expect(err.offset).toBe(input.indexOf("nowhere"));
		});

		test("a cycle through 2000 templates names every key on it", () => {
			const length = 2000;
			const input = doc(chain(length, (next) => `\`\${${next}}\``, "`${k0}`", "forward"));
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			const names = err.message.replace("Circular reference: ", "").split(" -> ");
			// Every key once, plus the first key again to close the cycle
			expect(names).toHaveLength(length + 2);
			expect(names[names.length - 1]).toBe(names[0]);
			expect(new Set(names).size).toBe(length + 1);
			// The position is the closing reference: the interpolation of the first-named key
			const closing = input.indexOf(`\${${names[0]}}`) + 2;
			expect(err.offset).toBe(closing);
		});
	});

	describe("diamonds", () => {
		test("two paths to the same key", () => {
			const input = "{ top: `${left}/${right}`, left: mid.a, right: mid.b, mid: { a: base, b: base }, base: shared, shared: 3 }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({
				top: "3/3",
				left: 3,
				right: 3,
				mid: { a: 3, b: 3 },
				base: 3,
				shared: 3
			});
		});

		test("references to the same object get their own copies", () => {
			const result = parseWithOptions("{ a: d, b: d, d: { x: [1, e] }, e: 2 }");
			expect(result).toEqual({ a: { x: [1, 2] }, b: { x: [1, 2] }, d: { x: [1, 2] }, e: 2 });
			expect(result.a).not.toBe(result.b);
			expect(result.a).not.toBe(result.d);
			expect(result.a.x).not.toBe(result.d.x);
			result.a.x.push(3);
			expect(result.d.x).toEqual([1, 2]);
		});

		test("a wide diamond: 500 keys referencing one forward chain", () => {
			const refs = Array.from({ length: 500 }, (_, i) => [`r${i}`, "c0"]);
			const input = doc([...refs, ["c0", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "{ n: 1 }"]]);
			const result = parseWithOptions(input);
			for (let i = 0; i < 500; i++) {
				expect(result[`r${i}`]).toEqual({ n: 1 });
			}
		});
	});

	describe("a large generated document", HEAVY, () => {
		/**
		 * Generate a document of `size` scalar keys s0..s<size-1>, where s<i> depends
		 * only on higher-numbered keys (so the graph is acyclic), plus a helper
		 * object per member-expression link. Keys are written in a shuffled order,
		 * so references point both forward and backward. Returns the source, the
		 * expected result and the number of references in it.
		 * @param {number} size
		 * @returns {{ source: string, expected: Record<string, unknown>, references: number }}
		 */
		function generate(size) {
			let seed = 54;
			const random = () => {
				seed = (seed * 1103515245 + 12345) % 2147483648;
				return seed / 2147483648;
			};
			const entries = [];
			const expected = {};
			let references = 0;
			for (let i = size - 1; i >= 0; i--) {
				if (i >= size - 20) {
					entries.push([`s${i}`, String(i)]);
					expected[`s${i}`] = i;
					continue;
				}
				// Mostly the next key (long chains), sometimes a random later one (fan-in)
				const j = random() < 0.7 ? i + 1 : i + 1 + Math.floor(random() * (size - i - 1));
				const kind = i % 3;
				if (kind === 0) {
					entries.push([`s${i}`, `s${j}`]);
					expected[`s${i}`] = expected[`s${j}`];
					references += 1;
				} else if (kind === 1) {
					entries.push([`s${i}`, `o${i}.v`], [`o${i}`, `{ v: s${j}, i: ${i} }`]);
					expected[`s${i}`] = expected[`s${j}`];
					expected[`o${i}`] = { v: expected[`s${j}`], i };
					references += 2;
				} else {
					entries.push([`s${i}`, `\`\${s${j}}\``]);
					expected[`s${i}`] = String(expected[`s${j}`]);
					references += 1;
				}
			}
			for (let i = entries.length - 1; i > 0; i--) {
				const k = Math.floor(random() * (i + 1));
				[entries[i], entries[k]] = [entries[k], entries[i]];
			}
			return { source: doc(entries), expected, references };
		}

		/**
		 * Parse `source` once, then return the best-of-three wall time, in
		 * milliseconds, of evaluating it (pass 1 plus reference resolution), and
		 * how many times the resolver looked up a reference or evaluated a template.
		 * @param {string} source
		 * @returns {{ ms: number, steps: number }}
		 */
		function measure(source) {
			const parser = new Parser(source, { year: 2015 });
			const { program } = parser.parse();
			let ms = Infinity;
			for (let run = 0; run < 3; run++) {
				const start = performance.now();
				parser.evaluate(program);
				ms = Math.min(ms, performance.now() - start);
			}
			const lookups = vi.spyOn(Parser.prototype, "lookupReference");
			const templates = vi.spyOn(Parser.prototype, "resolveTemplate");
			try {
				parser.evaluate(program);
				return { ms, steps: lookups.mock.calls.length + templates.mock.calls.length };
			} finally {
				lookups.mockRestore();
				templates.mockRestore();
			}
		}

		test("thousands of references resolve to the expected values", () => {
			const { source, expected, references } = generate(5000);
			expect(references).toBeGreaterThan(5000);
			expect(parseWithOptions(source, { year: 2015 })).toEqual(expected);
		});

		test("resolution work grows linearly with the number of references, not quadratically", () => {
			const small = generate(3000);
			const large = generate(12000);
			measure(small.source); // warm up
			const smallRun = measure(small.source);
			const largeRun = measure(large.source);
			const scale = large.references / small.references;
			console.log(
				`[#54 timing] ${small.references} references: ${smallRun.ms.toFixed(1)} ms, ${smallRun.steps} steps; ` +
					`${large.references} references: ${largeRun.ms.toFixed(1)} ms, ${largeRun.steps} steps; ` +
					`${scale.toFixed(2)}x the references took ${(largeRun.ms / smallRun.ms).toFixed(2)}x the time and ${(largeRun.steps / smallRun.steps).toFixed(2)}x the steps`
			);
			// Each reference is looked up a bounded number of times: the step count
			// scales with the reference count (a quadratic resolver would scale ~16x).
			// Wall time is logged rather than asserted, as it is noisy on shared runners.
			expect(largeRun.steps / smallRun.steps).toBeLessThan(scale * 1.1);
			expect(smallRun.steps).toBeLessThan(small.references * 3);
		});

		test("a cycle appended to a large document is still found", () => {
			const { source } = generate(2000);
			const input = source.replace(/ }$/, ", loopA: loopB, loopB: loopA }");
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Circular reference: loopA -> loopB -> loopA");
			expect(err.offset).toBe(input.lastIndexOf("loopA"));
		});
	});

	describe("cycles", () => {
		test("a two-key cycle names the cycle and points at the reference that closes it", () => {
			const input = "{\n  a: b,\n  b: a\n}";
			const err = thrown(() => parseWithOptions(input));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			expect(err.message).toBe("Circular reference: a -> b -> a");
			expect(err.line).toBe(3);
			expect(err.column).toBe(5);
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a self-reference", () => {
			const input = "{ a: a }";
			const err = thrown(() => parseWithOptions(input));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			expect(err.message).toBe("Circular reference: a -> a");
			expect(err.line).toBe(1);
			expect(err.column).toBe(5);
			expect(err.offset).toBe(5);
		});

		test("a three-key cycle", () => {
			const input = "{ a: b, b: c, c: a }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: a -> b -> c -> a");
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a cycle reached through a chain names only the cycle", () => {
			const input = "{ start: x1, x1: x2, x2: loop1, loop1: loop2, loop2: loop1 }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: loop1 -> loop2 -> loop1");
			expect(err.offset).toBe(input.lastIndexOf("loop1"));
		});

		test("a cycle through a member expression", () => {
			const input = "{ a: b.x, b: { x: a } }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: a -> b.x -> a");
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a member expression through its own key", () => {
			const input = "{ a: a.x }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: a -> a.x");
			expect(err.offset).toBe(input.indexOf("a.x"));
		});

		test("a value that contains a reference to itself", () => {
			const input = "{ a: { x: a } }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: a.x -> a");
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a value that contains a reference to a key referring back to it", () => {
			const input = "{ a: b, b: { x: a } }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Circular reference: b.x -> a -> b");
			expect(err.offset).toBe(input.indexOf("b"));
		});

		test("a template self-reference", () => {
			const input = "{ t: `${t}` }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err.message).toBe("Circular reference: t -> t");
			expect(err.offset).toBe(input.lastIndexOf("t"));
		});

		test("a template whose interpolated value contains the template", () => {
			const input = "{ a: { s: `${a}` } }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err.message).toBe("Circular reference: a.s -> a");
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a cycle through an array element", () => {
			const cyclic = "{ list: [1, list] }";
			const err = thrown(() => parseWithOptions(cyclic));
			expect(err.message).toBe("Circular reference: list[1] -> list");
			expect(err.offset).toBe(cyclic.lastIndexOf("list"));
		});
	});

	describe("undefined references", () => {
		test("a chain ending in an undefined reference reports that reference", () => {
			const input = "{ a: b, b: c, c: missing }";
			const err = thrown(() => parseWithOptions(input));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			expect(err.message).toBe("Unresolved reference: missing (circular reference or undefined)");
			expect(err.offset).toBe(input.indexOf("missing"));
		});

		test.each(ORDERS)("a 50-key chain ending in an undefined reference, %s order", (order) => {
			const input = doc(chain(50, (next) => next, "nowhere", order));
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Unresolved reference: nowhere (circular reference or undefined)");
			expect(err.offset).toBe(input.indexOf("nowhere"));
		});

		test("a member path through a chain to a missing key", () => {
			const input = "{ a: b.nope, b: c, c: { x: 1 } }";
			const err = thrown(() => parseWithOptions(input));
			expect(err.message).toBe("Unresolved reference: b.nope (circular reference or undefined)");
			expect(err.offset).toBe(input.indexOf("b.nope"));
		});

		test("a template whose interpolation is missing reports the template", () => {
			const input = "{ a: b, b: `x${nope}` }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err.message).toBe("Unresolved reference: <template> (circular reference or undefined)");
			expect(err.offset).toBe(input.indexOf("`"));
		});
	});

	describe("every entry point", () => {
		const input = "{ a: b, b: c, c: d, d: e, e: f, f: 1 }";
		const expected = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 };
		const templateInput = "{ t: `${a}`, a: b, b: c, c: d, d: e, e: 'x' }";
		const templateExpected = { t: "x", a: "x", b: "x", c: "x", d: "x", e: "x" };

		test("parse", () => {
			expect(parse(input)).toEqual(expected);
			expect(parse(templateInput)).toEqual(templateExpected);
		});

		test("parseWithOptions", () => {
			expect(parseWithOptions(input)).toEqual(expected);
			expect(parseWithOptions(templateInput, { year: 2015 })).toEqual(templateExpected);
		});

		test("default export parse / parseWithOptions", () => {
			expect(JSONV.parse(input)).toEqual(expected);
			expect(JSONV.parseWithOptions(input)).toEqual(expected);
		});

		test("year module 2011 (identifiers only)", () => {
			expect(JSONV2011.parse(input)).toEqual(expected);
			expect(JSONV2011.parseWithOptions(input)).toEqual(expected);
		});

		test.each([
			["2015", JSONV2015],
			["2020", JSONV2020],
			["2021", JSONV2021]
		])("year module %s", (_year, api) => {
			expect(api.parse(input)).toEqual(expected);
			expect(api.parseWithOptions(templateInput)).toEqual(templateExpected);
		});

		test("diagnose treats a long chain as valid", () => {
			expect(JSONV.diagnose(input).valid).toBe(true);
			expect(JSONV.diagnose("{ a: b, b: a }").valid).toBe(false);
		});

		test("a reviver sees fully resolved values", () => {
			const seen = {};
			parse(input, function (key, value) {
				seen[key] = value;
				return value;
			});
			expect(seen).toMatchObject(expected);
		});

		test("a Parser instance can evaluate more than once", () => {
			const parser = new Parser(input);
			const { program } = parser.parse();
			expect(parser.evaluate(program)).toEqual(expected);
			expect(parser.evaluate(program)).toEqual(expected);
		});
	});
});
