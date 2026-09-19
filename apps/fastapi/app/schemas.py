from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class CreateGroupBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class AddGroupDocumentBody(BaseModel):
    documentId: str
    role: Literal["QUESTION_PAPER", "ANSWER_KEY", "SOLUTIONS", "SUPPORTING"] = "QUESTION_PAPER"


class CreateRelationshipBody(BaseModel):
    targetDocumentId: str
    type: Literal["ANSWER_KEY_FOR", "SOLUTION_FOR", "RELATED"]


class ReviewActionBody(BaseModel):
    resolution: str | None = Field(default=None, max_length=2000)


class ReviewPatchBody(ReviewActionBody):
    status: Literal["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]


class OptionUpdate(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1)
    text: str = Field(min_length=1)


class UpdateQuestionBody(BaseModel):
    questionText: str | None = Field(default=None, min_length=1)
    questionType: Literal[
        "MCQ",
        "MULTI_SELECT",
        "TRUE_FALSE",
        "FILL_IN_THE_BLANK",
        "SHORT_ANSWER",
        "LONG_ANSWER",
        "UNKNOWN",
    ] | None = None
    questionNumber: str | None = Field(default=None, min_length=1)
    options: list[OptionUpdate] | None = None
    answerValue: str | None = None
