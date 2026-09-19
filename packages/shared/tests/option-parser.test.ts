import { describe, expect, it } from "vitest";
import { isSequentialOption, parseOption } from "../src/option-parser.js";

describe("option parsing", () => {
  it("parses A. B. C. D. options", () => {
    expect(parseOption("A. Newton")?.label).toBe("A");
    expect(parseOption("B. Joule")?.text).toBe("Joule");
    expect(parseOption("C. Pascal")?.style).toBe("A.");
    expect(parseOption("D. Watt")?.label).toBe("D");
  });

  it("parses (a) (b) (c) (d) options", () => {
    expect(parseOption("(a) Hydrogen")?.label).toBe("A");
    expect(parseOption("(b) Helium")?.label).toBe("B");
    expect(parseOption("(c) Lithium")?.label).toBe("C");
    expect(parseOption("(d) Beryllium")?.label).toBe("D");
  });

  it("detects sequential labels", () => {
    expect(isSequentialOption("A", "B")).toBe(true);
    expect(isSequentialOption("B", "D")).toBe(false);
    expect(isSequentialOption(undefined, "A")).toBe(true);
  });
});
