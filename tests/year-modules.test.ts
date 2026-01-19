/**
 * Tests for year module APIs (2011, 2015, 2020, 2021)
 * Tests the exported API functions from each year module
 */

import { describe, it, expect } from "vitest";
import JSONV2011, * as api2011 from "../src/years/2011.mjs";
import JSONV2015, * as api2015 from "../src/years/2015.mjs";
import JSONV2020, * as api2020 from "../src/years/2020.mjs";
import JSONV2021, * as api2021 from "../src/years/2021.mjs";

describe("Year Module: 2011 (JSON5)", () => {
	describe("parse()", () => {
		it("Should parse JSON5 syntax", () => {
			expect(api2011.parse("{ a: 1, b: 2 }")).toEqual({ a: 1, b: 2 });
			expect(api2011.parse("{ a: 'single-quoted' }")).toEqual({ a: "single-quoted" });
			expect(api2011.parse("{ a: 1, }")).toEqual({ a: 1 }); // trailing comma
		});

		it("Should parse hex numbers", () => {
			expect(api2011.parse("{ value: 0xFF }")).toEqual({ value: 255 });
			expect(api2011.parse("{ value: 0xDEAD }")).toEqual({ value: 0xdead });
		});

		it("Should parse with comments", () => {
			expect(
				api2011.parse(`
				// comment
				{ a: 1 /* inline */ }
			`)
			).toEqual({ a: 1 });
		});

		it("Should handle special values", () => {
			expect(api2011.parse("{ inf: Infinity, neg: -Infinity, nan: NaN }")).toEqual({
				inf: Infinity,
				neg: -Infinity,
				nan: NaN
			});
		});
	});

	describe("parseWithOptions()", () => {
		it("Should accept explicit options", () => {
			expect(api2011.parseWithOptions("{ a: 1 }", { mode: "jsonv" })).toEqual({ a: 1 });
		});

		it("Should apply year 2011 defaults", () => {
			// Binary literals should NOT work in 2011
			expect(() => api2011.parseWithOptions("{ value: 0b1010 }")).toThrow();
		});
	});

	describe("stringify()", () => {
		it("Should stringify with jsonv defaults", () => {
			const result = api2011.stringify({ a: 1, b: 2 });
			expect(result).toBe("{a:1,b:2}");
		});

		it("Should handle special values", () => {
			expect(api2011.stringify({ inf: Infinity })).toBe("{inf:Infinity}");
			expect(api2011.stringify({ nan: NaN })).toBe("{nan:NaN}");
		});

		it("Should accept replacer and space", () => {
			const result = api2011.stringify({ a: 1, b: 2 }, null, 2);
			expect(result).toContain("  ");
		});
	});

	describe("stringifyWithOptions()", () => {
		it("Should accept explicit options", () => {
			const result = api2011.stringifyWithOptions({ a: 1 }, { mode: "jsonv" });
			expect(result).toBe("{a:1}");
		});

		it("Should support JSON mode", () => {
			const result = api2011.stringifyWithOptions({ a: 1 }, { mode: "json" });
			expect(result).toBe('{"a":1}');
		});
	});

	describe("diagnose()", () => {
		it("Should analyze jsonv text", () => {
			const result = api2011.diagnose("{ a: 1, b: 2 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("features");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ a: 1, b: 2 });
		});

		it("Should detect errors", () => {
			const result = api2011.diagnose("{ invalid }");
			expect(result.valid).toBe(false);
		});
	});

	describe("info()", () => {
		it("Should return basic info", () => {
			const result = api2011.info("{ a: 1 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ a: 1 });
		});
	});

	describe("rawJSON()", () => {
		it("Should create raw JSON object", () => {
			const raw = api2011.rawJSON('{"x":1}');
			expect(api2011.isRawJSON(raw)).toBe(true);
			expect(api2011.stringify({ data: raw })).toContain('{"x":1}');
		});
	});

	describe("isRawJSON()", () => {
		it("Should identify raw JSON objects", () => {
			const raw = api2011.rawJSON('{"x":1}');
			expect(api2011.isRawJSON(raw)).toBe(true);
			expect(api2011.isRawJSON({ x: 1 })).toBe(false);
		});
	});

	describe("JSONV default export", () => {
		it("Should export JSONV object with all methods", () => {
			expect(JSONV2011).toHaveProperty("parse");
			expect(JSONV2011).toHaveProperty("stringify");
			expect(JSONV2011).toHaveProperty("diagnose");
			expect(JSONV2011).toHaveProperty("info");
			expect(JSONV2011).toHaveProperty("rawJSON");
			expect(JSONV2011).toHaveProperty("isRawJSON");
		});

		it("Should work through default export", () => {
			expect(JSONV2011.parse("{ a: 1 }")).toEqual({ a: 1 });
			expect(JSONV2011.stringify({ a: 1 })).toBe("{a:1}");
		});
	});
});

describe("Year Module: 2015 (ES6)", () => {
	describe("parse()", () => {
		it("Should parse binary literals", () => {
			expect(api2015.parse("{ value: 0b1010 }")).toEqual({ value: 10 });
			expect(api2015.parse("{ value: 0b11110000 }")).toEqual({ value: 240 });
		});

		it("Should parse new octal syntax", () => {
			expect(api2015.parse("{ value: 0o755 }")).toEqual({ value: 493 });
			expect(api2015.parse("{ value: 0o644 }")).toEqual({ value: 420 });
		});

		it("Should parse old octal syntax", () => {
			expect(api2015.parse("{ value: 0755 }")).toEqual({ value: 493 });
		});

		it("Should parse template literals", () => {
			expect(api2015.parse("{ text: `hello` }")).toEqual({ text: "hello" });
			expect(api2015.parse("{ text: `multi\nline` }")).toEqual({ text: "multi\nline" });
		});

		it("Should parse all JSON5 features", () => {
			expect(api2015.parse("{ a: 1, }")).toEqual({ a: 1 });
			expect(api2015.parse("{ hex: 0xFF }")).toEqual({ hex: 255 });
		});
	});

	describe("stringify()", () => {
		it("Should stringify with jsonv defaults", () => {
			expect(api2015.stringify({ a: 1 })).toBe("{a:1}");
		});
	});

	describe("diagnose() and info()", () => {
		it("Should analyze text", () => {
			const result = api2015.diagnose("{ value: 0b1010 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 10 });
		});

		it("Should get basic info", () => {
			const result = api2015.info("{ value: 0b1010 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 10 });
		});
	});

	describe("rawJSON()", () => {
		it("Should create raw JSON object", () => {
			const raw = api2015.rawJSON('{"x":1}');
			expect(api2015.isRawJSON(raw)).toBe(true);
		});
	});

	describe("isRawJSON()", () => {
		it("Should identify raw JSON objects", () => {
			const raw = api2015.rawJSON('{"x":1}');
			expect(api2015.isRawJSON(raw)).toBe(true);
			expect(api2015.isRawJSON({ x: 1 })).toBe(false);
		});
	});

	describe("JSONV default export", () => {
		it("Should export JSONV object", () => {
			expect(JSONV2015).toHaveProperty("parse");
			expect(JSONV2015.parse("{ a: 0b1010 }")).toEqual({ a: 10 });
		});
	});
});

describe("Year Module: 2020 (BigInt)", () => {
	describe("parse()", () => {
		it("Should parse BigInt literals", () => {
			expect(api2020.parse("{ value: 123n }")).toEqual({ value: 123n });
			expect(api2020.parse("{ big: 9007199254740992n }")).toEqual({ big: 9007199254740992n });
		});

		it("Should parse BigInt in all bases", () => {
			expect(api2020.parse("{ hex: 0xFFn }")).toEqual({ hex: 255n });
			expect(api2020.parse("{ bin: 0b1010n }")).toEqual({ bin: 10n });
			expect(api2020.parse("{ oct: 0o755n }")).toEqual({ oct: 493n });
		});

		it("Should parse all ES2015 features", () => {
			expect(api2020.parse("{ bin: 0b1010 }")).toEqual({ bin: 10 });
			expect(api2020.parse("{ oct: 0o755 }")).toEqual({ oct: 493 });
		});
	});

	describe("stringify()", () => {
		it("Should stringify BigInt with 'n' suffix", () => {
			expect(api2020.stringify({ value: 123n })).toBe("{value:123n}");
		});
	});

	describe("stringifyWithOptions()", () => {
		it("Should support bigint: 'native' mode", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { bigint: "native" });
			expect(result).toBe("{value:123n}");
		});

		it("Should support bigint: 'string' mode", () => {
			const result = api2020.stringifyWithOptions({ value: 123n }, { bigint: "string" });
			expect(result).toBe('{value:"123"}');
		});
	});

	describe("diagnose() and info()", () => {
		it("Should analyze BigInt text", () => {
			const result = api2020.diagnose("{ value: 123n }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 123n });
		});

		it("Should get basic info", () => {
			const result = api2020.info("{ value: 123n }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 123n });
		});
	});

	describe("rawJSON()", () => {
		it("Should create raw JSON object", () => {
			const raw = api2020.rawJSON('{"x":1}');
			expect(api2020.isRawJSON(raw)).toBe(true);
		});
	});

	describe("isRawJSON()", () => {
		it("Should identify raw JSON objects", () => {
			const raw = api2020.rawJSON('{"x":1}');
			expect(api2020.isRawJSON(raw)).toBe(true);
			expect(api2020.isRawJSON({ x: 1 })).toBe(false);
		});
	});

	describe("JSONV default export", () => {
		it("Should export JSONV object", () => {
			expect(JSONV2020).toHaveProperty("parse");
			expect(JSONV2020.parse("{ value: 123n }")).toEqual({ value: 123n });
		});
	});
});

describe("Year Module: 2021 (Numeric Separators)", () => {
	describe("parse()", () => {
		it("Should parse numeric separators in decimal", () => {
			expect(api2021.parse("{ value: 1_000_000 }")).toEqual({ value: 1000000 });
			expect(api2021.parse("{ value: 3.141_592 }")).toEqual({ value: 3.141592 });
		});

		it("Should parse numeric separators in hex", () => {
			expect(api2021.parse("{ value: 0xFF_AA_BB }")).toEqual({ value: 0xffaabb });
		});

		it("Should parse numeric separators in binary", () => {
			expect(api2021.parse("{ value: 0b1111_0000 }")).toEqual({ value: 0b11110000 });
		});

		it("Should parse numeric separators in octal", () => {
			expect(api2021.parse("{ value: 0o755_123 }")).toEqual({ value: 0o755123 });
		});

		it("Should parse numeric separators in BigInt", () => {
			expect(api2021.parse("{ value: 1_000_000n }")).toEqual({ value: 1000000n });
			expect(api2021.parse("{ value: 0xFF_AAn }")).toEqual({ value: 0xffaan });
		});

		it("Should parse all ES2020 features", () => {
			expect(api2021.parse("{ big: 123n }")).toEqual({ big: 123n });
			expect(api2021.parse("{ bin: 0b1010 }")).toEqual({ bin: 10 });
		});
	});

	describe("stringify()", () => {
		it("Should stringify with jsonv defaults", () => {
			expect(api2021.stringify({ value: 1000000 })).toBe("{value:1000000}");
			expect(api2021.stringify({ big: 123n })).toBe("{big:123n}");
		});
	});

	describe("diagnose() and info()", () => {
		it("Should analyze text with numeric separators", () => {
			const result = api2021.diagnose("{ value: 1_000_000 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 1000000 });
		});

		it("Should get basic info", () => {
			const result = api2021.info("{ value: 1_000_000 }");
			expect(result.valid).toBe(true);
			expect(result).toHaveProperty("year");
			expect(result).toHaveProperty("value");
			expect(result.value).toEqual({ value: 1000000 });
		});
	});

	describe("rawJSON()", () => {
		it("Should create raw JSON object", () => {
			const raw = api2021.rawJSON('{"x":1}');
			expect(api2021.isRawJSON(raw)).toBe(true);
		});
	});

	describe("isRawJSON()", () => {
		it("Should identify raw JSON objects", () => {
			const raw = api2021.rawJSON('{"x":1}');
			expect(api2021.isRawJSON(raw)).toBe(true);
			expect(api2021.isRawJSON({ x: 1 })).toBe(false);
		});
	});

	describe("JSONV default export", () => {
		it("Should export JSONV object", () => {
			expect(JSONV2021).toHaveProperty("parse");
			expect(JSONV2021.parse("{ value: 1_000_000 }")).toEqual({ value: 1000000 });
		});
	});
});

describe("Cross-Year Compatibility", () => {
	it("All year modules should parse basic JSON5", () => {
		const input = "{ a: 1, b: 2 }";
		expect(api2011.parse(input)).toEqual({ a: 1, b: 2 });
		expect(api2015.parse(input)).toEqual({ a: 1, b: 2 });
		expect(api2020.parse(input)).toEqual({ a: 1, b: 2 });
		expect(api2021.parse(input)).toEqual({ a: 1, b: 2 });
	});

	it("Older years should reject newer features", () => {
		// 2011 should reject binary literals
		expect(() => api2011.parse("{ value: 0b1010 }")).toThrow();

		// 2015 should reject BigInt
		expect(() => api2015.parse("{ value: 123n }")).toThrow();

		// 2020 should reject numeric separators
		expect(() => api2020.parse("{ value: 1_000 }")).toThrow();
	});

	it("All year modules should stringify basic objects", () => {
		const obj = { a: 1, b: 2 };
		expect(api2011.stringify(obj)).toBe("{a:1,b:2}");
		expect(api2015.stringify(obj)).toBe("{a:1,b:2}");
		expect(api2020.stringify(obj)).toBe("{a:1,b:2}");
		expect(api2021.stringify(obj)).toBe("{a:1,b:2}");
	});
});
