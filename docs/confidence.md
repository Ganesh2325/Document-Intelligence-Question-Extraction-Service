# Confidence formula

Overall confidence is a weighted combination of the signals that actually exist for a question. Missing signals are dropped from the denominator so unanswered questions are not punished when no answer key was supplied.

```
weights:
  text            0.22
  boundary        0.18
  numbering       0.12
  options         0.16
  sourceMapping   0.12
  answer          0.12   (only if a matched answer exists)
  ocr             0.08   (only if OCR ran)

overall = sum(weight_i * score_i) / sum(weight_i used)
```

Component scores are stored on the question:

| Field | Meaning |
| --- | --- |
| `textConfidence` | Quality / completeness of reconstructed stem text |
| `boundaryConfidence` | How sure we are the question starts and ends here |
| `numberingConfidence` | Strength of the numbering pattern that opened the question |
| `optionsConfidence` | Mean option-parse confidence (or 0.55 if no options) |
| `answerConfidence` | Match quality; 0 if missing/uncertain |
| `sourceMappingConfidence` | Regions present (0.95), else page-level (0.80) |

Bands used in the UI:

- **High** ≥ 0.85
- **Medium** 0.70–0.84
- **Needs review** < 0.70 (also any open review item)

These thresholds are product policy, not invented per-row decorations.
