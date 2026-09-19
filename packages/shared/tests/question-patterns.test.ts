import { describe, expect, it } from "vitest";
import { matchQuestionStart, normalizeQuestionNumber } from "../src/question-patterns.js";

describe("question-number detection", () => {
  it.each([
    ["1. What is gravity?", "1", "dotted"],
    ["Question 1. What is gravity?", "1", "question"],
    ["Q1. What is gravity?", "1", "q-dot"],
    ["1) What is gravity?", "1", "paren-close"],
    ["(1) What is gravity?", "1", "paren"],
    ["Question No. 1 What is gravity?", "1", "question-no"],
    ["Question Number 12: Describe osmosis.", "12", "question-no"],
    ["Q. 3) Define force.", "3", "q-dot"],
  ])("detects %s", (line, number, style) => {
    const match = matchQuestionStart(line);
    expect(match).not.toBeNull();
    expect(match?.questionNumber).toBe(number);
    expect(match?.style).toBe(style);
  });

  it("does not treat an option line as a question", () => {
    expect(matchQuestionStart("A. Newton")).toBeNull();
    expect(matchQuestionStart("(b) Joule")).toBeNull();
  });

  it("normalizes leading zeros", () => {
    expect(normalizeQuestionNumber("07")).toBe("7");
  });
});
