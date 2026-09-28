/**
 * End-user API tests for @cldmv/jsonv
 * Tests how users would actually use the library
 */

import { describe, test, expect } from "vitest";
import JSONV from "../src/index.mjs";

describe("JSONV API - End User Experience", () => {
	describe("Default export", () => {
		test("should export JSONV object with all methods", () => {
			expect(JSONV).toBeDefined();
			expect(JSONV.parse).toBeTypeOf("function");
			expect(JSONV.stringify).toBeTypeOf("function");
			expect(JSONV.isRawJSON).toBeTypeOf("function");
			expect(JSONV.rawJSON).toBeTypeOf("function");
			expect(JSONV.diagnose).toBeTypeOf("function");
			expect(JSONV.info).toBeTypeOf("function");
		});
	});

	describe("JSONV.parse() - JSON compatible", () => {
		test("should parse JSON", () => {
			const result = JSONV.parse('{"key":"value"}');
			expect(result).toEqual({ key: "value" });
		});

		test("should parse JSON5 features", () => {
			const result = JSONV.parse("{ key: 'value', trailing: true, }");
			expect(result).toEqual({ key: "value", trailing: true });
		});

		test("should parse comments", () => {
			const result = JSONV.parse(`{
				// Single line comment
				key: "value",
				/* Multi-line
				   comment */
				num: 42
			}`);
			expect(result).toEqual({ key: "value", num: 42 });
		});

		test("should parse hex literals", () => {
			const result = JSONV.parse("{ value: 0xFF }");
			expect(result).toEqual({ value: 255 });
		});

		test("should parse binary literals (ES2015)", () => {
			const result = JSONV.parse("{ value: 0b1010 }");
			expect(result).toEqual({ value: 10 });
		});

		test("should parse octal literals (ES2015)", () => {
			const result = JSONV.parse("{ value: 0o755 }");
			expect(result).toEqual({ value: 493 });
		});

		test("should parse BigInt literals (ES2020)", () => {
			const result = JSONV.parse("{ value: 9007199254740992n }");
			expect(result.value).toBe(9007199254740992n);
		});

		test("should parse numeric separators (ES2021)", () => {
			const result = JSONV.parse("{ value: 1_000_000 }");
			expect(result).toEqual({ value: 1000000 });
		});

		test("should parse internal references (bare identifiers)", () => {
			const result = JSONV.parse("{ port: 8080, backup: port }");
			expect(result).toEqual({ port: 8080, backup: 8080 });
		});

		test("should parse template literals", () => {
			const result = JSONV.parse("{ text: `multi-line\\nstring` }");
			expect(result.text).toBe("multi-line\nstring");
		});

		test("should parse template interpolation (ES2015)", () => {
			const result = JSONV.parse('{ host: "localhost", port: 8080, url: `http://${host}:${port}` }');
			expect(result).toEqual({
				host: "localhost",
				port: 8080,
				url: "http://localhost:8080"
			});
		});

		test("should support forward references", () => {
			const result = JSONV.parse("{ a: b, b: 42 }");
			expect(result).toEqual({ a: 42, b: 42 });
		});

		test("should support nested property access", () => {
			const result = JSONV.parse("{ server: { port: 8080 }, backup: server.port }");
			expect(result).toEqual({
				server: { port: 8080 },
				backup: 8080
			});
		});
	});

	describe("JSONV.parse() - Reviver function", () => {
		test("should apply reviver function", () => {
			const result = JSONV.parse('{"a":1,"b":2}', function (key, value) {
				if (typeof value === "number") {
					return value * 2;
				}
				return value;
			});
			expect(result).toEqual({ a: 2, b: 4 });
		});

		test("should have correct 'this' context in reviver", () => {
			const result = JSONV.parse('{"parent":{"child":10}}', function (key, value) {
				if (key === "child" && typeof value === "number") {
					// 'this' should be the parent object
					return value + 5;
				}
				return value;
			});
			expect(result.parent.child).toBe(15);
		});

		test("should handle date strings with reviver", () => {
			const dateStr = "2026-01-16T00:00:00.000Z";
			const result = JSONV.parse(`{"date":"${dateStr}"}`, function (key, value) {
				if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
					return new Date(value);
				}
				return value;
			});
			expect(result.date).toBeInstanceOf(Date);
			expect(result.date.toISOString()).toBe(dateStr);
		});
	});

	describe("JSONV.parse() - Error handling", () => {
		test("should throw on invalid JSON", () => {
			expect(() => JSONV.parse("{invalid}")).toThrow();
		});

		test("should throw on circular references", () => {
			expect(() => JSONV.parse("{ a: b, b: a }")).toThrow(/circular/i);
		});

		test("should provide error location", () => {
			try {
				JSONV.parse("{ invalid syntax here }");
				expect.fail("Should have thrown");
			} catch (err: any) {
				expect(err.message).toMatch(/line \d+/);
				expect(err.message).toMatch(/column \d+/);
			}
		});
	});

	describe("JSONV.stringify() - Phase 5", () => {
		test("should stringify basic object", () => {
			const result = JSONV.stringify({ key: "value" });
			expect(result).toContain("key");
			expect(result).toContain("value");
		});

		test("should stringify with indentation", () => {
			const result = JSONV.stringify({ a: 1, b: 2 }, null, 2);
			expect(result).toContain("  ");
			expect(result).toContain("\n");
		});

		test("should stringify BigInt with 'n' suffix", () => {
			const result = JSONV.stringify({ id: 9007199254740992n });
			expect(result).toContain("9007199254740992n");
		});

		test("should stringify in JSON mode", () => {
			const result = JSONV.stringifyWithOptions({ key: "value" }, { mode: "json" });
			expect(result).toContain('"key"');
			expect(result).toContain('"value"');
		});

		test("should stringify in JSON5 mode with unquoted keys", () => {
			const result = JSONV.stringifyWithOptions({ key: "value" }, { mode: "json5" });
			expect(result).toContain("key:");
		});
	});

	describe("JSONV.rawJSON() - Phase 5", () => {
		test("should create raw JSON object", () => {
			const raw = JSONV.rawJSON('{"key":"value"}');
			expect(JSONV.isRawJSON(raw)).toBe(true);
		});

		test("should throw on invalid JSON", () => {
			expect(() => JSONV.rawJSON("{invalid}")).toThrow(/valid JSON/);
		});

		test("should serialize raw JSON as-is", () => {
			const raw = JSONV.rawJSON('{"key":"value"}');
			const result = JSONV.stringify({ data: raw });
			expect(result).toContain('{"key":"value"}');
		});
	});

	describe("JSONV.isRawJSON() - Phase 5", () => {
		test("should return false for normal object", () => {
			expect(JSONV.isRawJSON({})).toBe(false);
		});

		test("should return true for raw JSON object", () => {
			const raw = JSONV.rawJSON('{"key":"value"}');
			expect(JSONV.isRawJSON(raw)).toBe(true);
		});
	});

	describe("JSONV.diagnose() - Phase 6", () => {
		test("should detect ES2015 binary literal", () => {
			const result = JSONV.diagnose("{ value: 0b1010 }");
			expect(result.year).toBe(2015);
			expect(result.features).toContain("binary-literals");
		});
	});

	describe("JSONV.info() - Phase 6", () => {
		test("should return year and value", () => {
			const result = JSONV.info("{ value: 0b1010 }");
			expect(result.year).toBe(2015);
			expect(result.value).toEqual({ value: 10 });
		});
	});

	describe("Named exports", () => {
		test("should export parse as named export", async () => {
			const { parse } = await import("../src/index.mjs");
			expect(parse).toBeTypeOf("function");
			const result = parse('{"key":"value"}');
			expect(result).toEqual({ key: "value" });
		});

		test("should export parseWithOptions as named export", async () => {
			const { parseWithOptions } = await import("../src/index.mjs");
			expect(parseWithOptions).toBeTypeOf("function");
			const result = parseWithOptions('{"key":"value"}', { mode: "json" });
			expect(result).toEqual({ key: "value" });
		});
	});

	describe("Real-world use cases", () => {
		test("should parse config file with comments and references", () => {
			const config = `{
				// Server configuration
				host: "localhost",
				port: 8080,
				
				// Database using same host
				database: {
					host: host,
					port: 5432,
					name: "myapp"
				},
				
				// Full URLs
				serverUrl: \`http://\${host}:\${port}\`,
				dbUrl: \`postgresql://\${database.host}:\${database.port}/\${database.name}\`,
				
				// Feature flags
				features: {
					newUI: true,
					betaFeatures: false,
				}
			}`;

			const result = JSONV.parse(config);
			expect(result.host).toBe("localhost");
			expect(result.database.host).toBe("localhost");
			expect(result.serverUrl).toBe("http://localhost:8080");
			expect(result.dbUrl).toBe("postgresql://localhost:5432/myapp");
			expect(result.features.newUI).toBe(true);
		});

		test("should parse package.json-like file with trailing commas", () => {
			const pkg = `{
				name: "@cldmv/jsonv",
				version: "0.1.0",
				dependencies: {
					vitest: "^4.0.0",
				},
				scripts: {
					test: "vitest run",
					build: "tsc",
				},
			}`;

			const result = JSONV.parse(pkg);
			expect(result.name).toBe("@cldmv/jsonv");
			expect(result.dependencies.vitest).toBe("^4.0.0");
		});

		test("should parse numeric config with separators and different bases", () => {
			const config = `{
				// File permissions
				fileMode: 0o644,
				dirMode: 0o755,
				
				// Bit flags
				permissions: 0b1111_0000,
				
				// Large numbers
				maxMemory: 1_000_000_000,
				maxFileSize: 100_000_000,
				
				// Hex colors
				primaryColor: 0xFF_AA_00,
				secondaryColor: 0x00_AA_FF,
			}`;

			const result = JSONV.parse(config);
			expect(result.fileMode).toBe(0o644);
			expect(result.dirMode).toBe(0o755);
			expect(result.permissions).toBe(0b11110000);
			expect(result.maxMemory).toBe(1000000000);
			expect(result.primaryColor).toBe(0xffaa00);
		});
	});
});
