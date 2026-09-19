import { describe, expect, it } from "vitest";
import { calculateConfidence, confidenceBand } from "../src/confidence.js";

describe("confidence calculation", () => {
  it("computes a weighted overall score from component signals", () => {
    const result = calculateConfidence({
      text: 0.96,
      boundary: 0.9,
      numbering: 0.94,
      options: 0.94,
      answer: 0.82,
      sourceMapping: 0.99,
      ocr: 0.9,
    });
    expect(result.overall).toBeGreaterThan(0.88);
    expect(result.overall).toBeLessThan(0.97);
    expect(result.text).toBe(0.96);
    expect(result.options).toBe(0.94);
    expect(confidenceBand(result.overall)).toBe("high");
  });

  it("does not fabricate high confidence from empty signals", () => {
    const result = calculateConfidence({
      text: 0.4,
      boundary: 0.4,
      numbering: 0.4,
      options: 0.2,
      answer: 0,
      sourceMapping: 0.5,
    });
    expect(result.overall).toBeLessThan(0.5);
    expect(confidenceBand(result.overall)).toBe("review");
  });
});
