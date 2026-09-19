TRUNCATE TABLE
  "ReviewItem",
  "ExtractionWarning",
  "AnswerSource",
  "Answer",
  "QuestionAsset",
  "QuestionOption",
  "Question",
  "ProcessingJob",
  "DocumentRelationship",
  "DocumentGroupMember",
  "DocumentGroup",
  "DocumentPage",
  "Document",
  "User"
RESTART IDENTITY CASCADE;

SELECT
  (SELECT count(*) FROM "User") AS users,
  (SELECT count(*) FROM "Document") AS documents,
  (SELECT count(*) FROM "Question") AS questions,
  (SELECT count(*) FROM "ReviewItem") AS review_items;
