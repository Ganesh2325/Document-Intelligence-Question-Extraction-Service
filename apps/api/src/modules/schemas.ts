import { z } from "zod";

export const registerBody = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const documentListQuery = paginationQuery.extend({
  status: z.string().optional(),
  q: z.string().optional(),
});

export const questionListQuery = paginationQuery.extend({
  status: z.string().optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  documentId: z.string().uuid().optional(),
  pageNumber: z.coerce.number().int().min(1).optional(),
  answered: z.enum(["true", "false"]).optional(),
  band: z.enum(["all", "high", "medium", "review"]).optional(),
});

export const createGroupBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const addGroupDocumentBody = z.object({
  documentId: z.string().uuid(),
  role: z.enum(["QUESTION_PAPER", "ANSWER_KEY", "SOLUTIONS", "SUPPORTING"]).default("QUESTION_PAPER"),
});

export const createRelationshipBody = z.object({
  targetDocumentId: z.string().uuid(),
  type: z.enum(["ANSWER_KEY_FOR", "SOLUTION_FOR", "RELATED"]),
});

export const reviewActionBody = z.object({
  resolution: z.string().max(2000).optional(),
});

export const updateQuestionBody = z.object({
  questionText: z.string().min(1).optional(),
  questionType: z.enum(["MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_IN_THE_BLANK", "SHORT_ANSWER", "LONG_ANSWER", "UNKNOWN"]).optional(),
  questionNumber: z.string().min(1).optional(),
  options: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        label: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .optional(),
  answerValue: z.string().nullable().optional(),
});
