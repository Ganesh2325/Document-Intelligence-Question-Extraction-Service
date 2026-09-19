from __future__ import annotations

import enum
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class DocumentStatus(str, enum.Enum):
    UPLOADING = "UPLOADING"
    UPLOADED = "UPLOADED"
    QUEUED = "QUEUED"
    VALIDATING = "VALIDATING"
    PREPROCESSING = "PREPROCESSING"
    OCR_PROCESSING = "OCR_PROCESSING"
    STRUCTURE_ANALYSIS = "STRUCTURE_ANALYSIS"
    QUESTION_EXTRACTION = "QUESTION_EXTRACTION"
    ANSWER_ANALYSIS = "ANSWER_ANALYSIS"
    VALIDATING_RESULTS = "VALIDATING_RESULTS"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    COMPLETED = "COMPLETED"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    MULTI_SELECT = "MULTI_SELECT"
    TRUE_FALSE = "TRUE_FALSE"
    FILL_IN_THE_BLANK = "FILL_IN_THE_BLANK"
    SHORT_ANSWER = "SHORT_ANSWER"
    LONG_ANSWER = "LONG_ANSWER"
    UNKNOWN = "UNKNOWN"


class QuestionStatus(str, enum.Enum):
    EXTRACTED = "EXTRACTED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    PARTIAL = "PARTIAL"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class AnswerStatus(str, enum.Enum):
    MATCHED = "MATCHED"
    UNCERTAIN = "UNCERTAIN"
    MISSING = "MISSING"


class ReviewStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class ReviewSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class DocumentRole(str, enum.Enum):
    QUESTION_PAPER = "QUESTION_PAPER"
    ANSWER_KEY = "ANSWER_KEY"
    SOLUTIONS = "SOLUTIONS"
    SUPPORTING = "SUPPORTING"


class RelationshipType(str, enum.Enum):
    ANSWER_KEY_FOR = "ANSWER_KEY_FOR"
    SOLUTION_FOR = "SOLUTION_FOR"
    RELATED = "RELATED"


class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


def pg_enum(enum_cls: type[enum.Enum], name: str):
    return ENUM(enum_cls, name=name, create_type=False, values_callable=lambda x: [e.value for e in x])


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    passwordHash: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents: Mapped[list["Document"]] = relationship(back_populates="owner")


class Document(Base):
    __tablename__ = "Document"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    ownerId: Mapped[str] = mapped_column(Text, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mimeType: Mapped[str] = mapped_column(Text, nullable=False)
    sizeBytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storageKey: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(pg_enum(DocumentStatus, "DocumentStatus"), default=DocumentStatus.UPLOADING)
    currentStage: Mapped[str | None] = mapped_column(Text)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    pageCount: Mapped[int | None] = mapped_column(Integer)
    startedAt: Mapped[datetime | None] = mapped_column(DateTime)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime)
    failureReason: Mapped[str | None] = mapped_column(Text)
    failureCode: Mapped[str | None] = mapped_column(Text)
    retryCount: Mapped[int] = mapped_column(Integer, default=0)
    processingDurationMs: Mapped[int | None] = mapped_column(Integer)
    processingVersion: Mapped[int] = mapped_column(Integer, default=0)
    averageConfidence: Mapped[float | None] = mapped_column(Float)
    highConfidenceCount: Mapped[int] = mapped_column(Integer, default=0)
    reviewCount: Mapped[int] = mapped_column(Integer, default=0)
    questionCount: Mapped[int] = mapped_column(Integer, default=0)
    detectedAsAnswerKey: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped[User] = relationship(back_populates="documents")
    pages: Mapped[list["DocumentPage"]] = relationship(back_populates="document")
    questions: Mapped[list["Question"]] = relationship(back_populates="document")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="document")


class DocumentPage(Base):
    __tablename__ = "DocumentPage"
    __table_args__ = (UniqueConstraint("documentId", "pageNumber"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    pageNumber: Mapped[int] = mapped_column(Integer, nullable=False)
    storageKey: Mapped[str | None] = mapped_column(Text)
    textContent: Mapped[str | None] = mapped_column(Text)
    hasSelectableText: Mapped[bool] = mapped_column(Boolean, default=False)
    usedOcr: Mapped[bool] = mapped_column(Boolean, default=False)
    ocrConfidence: Mapped[float | None] = mapped_column(Float)
    width: Mapped[float | None] = mapped_column(Float)
    height: Mapped[float | None] = mapped_column(Float)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    document: Mapped[Document] = relationship(back_populates="pages")


class DocumentGroup(Base):
    __tablename__ = "DocumentGroup"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    ownerId: Mapped[str] = mapped_column(Text, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    members: Mapped[list["DocumentGroupMember"]] = relationship(back_populates="group")


class DocumentGroupMember(Base):
    __tablename__ = "DocumentGroupMember"
    __table_args__ = (UniqueConstraint("groupId", "documentId", name="DocumentGroupMember_groupId_documentId_key"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    groupId: Mapped[str] = mapped_column(Text, ForeignKey("DocumentGroup.id", ondelete="CASCADE"), nullable=False)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[DocumentRole] = mapped_column(pg_enum(DocumentRole, "DocumentRole"), default=DocumentRole.QUESTION_PAPER)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    group: Mapped[DocumentGroup] = relationship(back_populates="members")
    document: Mapped[Document] = relationship()


class DocumentRelationship(Base):
    __tablename__ = "DocumentRelationship"
    __table_args__ = (
        UniqueConstraint(
            "sourceDocumentId",
            "targetDocumentId",
            "type",
            name="DocumentRelationship_sourceDocumentId_targetDocumentId_type_key",
        ),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    sourceDocumentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    targetDocumentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[RelationshipType] = mapped_column(pg_enum(RelationshipType, "RelationshipType"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ProcessingJob(Base):
    __tablename__ = "ProcessingJob"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    queueName: Mapped[str] = mapped_column(Text, nullable=False)
    bullJobId: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[JobStatus] = mapped_column(pg_enum(JobStatus, "JobStatus"), default=JobStatus.QUEUED)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    startedAt: Mapped[datetime | None] = mapped_column(DateTime)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime)
    durationMs: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    document: Mapped[Document] = relationship(back_populates="jobs")


class Question(Base):
    __tablename__ = "Question"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    processingVersion: Mapped[int] = mapped_column(Integer, nullable=False)
    sortOrder: Mapped[int] = mapped_column(Integer, nullable=False)
    questionNumber: Mapped[str] = mapped_column(Text, nullable=False)
    questionText: Mapped[str] = mapped_column(Text, nullable=False)
    questionType: Mapped[QuestionType] = mapped_column(pg_enum(QuestionType, "QuestionType"), default=QuestionType.UNKNOWN)
    status: Mapped[QuestionStatus] = mapped_column(pg_enum(QuestionStatus, "QuestionStatus"), default=QuestionStatus.EXTRACTED)
    overallConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    textConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    optionsConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    answerConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    sourceMappingConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    boundaryConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    numberingConfidence: Mapped[float] = mapped_column(Float, nullable=False)
    startPage: Mapped[int] = mapped_column(Integer, nullable=False)
    endPage: Mapped[int] = mapped_column(Integer, nullable=False)
    sourcePages: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    sourceRegions: Mapped[object] = mapped_column(JSONB, nullable=False)
    warnings: Mapped[object | None] = mapped_column(JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    document: Mapped[Document] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(back_populates="question")
    assets: Mapped[list["QuestionAsset"]] = relationship(back_populates="question")
    answer: Mapped["Answer | None"] = relationship(back_populates="question", uselist=False)
    reviewItems: Mapped[list["ReviewItem"]] = relationship(back_populates="question")


class QuestionOption(Base):
    __tablename__ = "QuestionOption"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    questionId: Mapped[str] = mapped_column(Text, ForeignKey("Question.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    sortOrder: Mapped[int] = mapped_column(Integer, nullable=False)

    question: Mapped[Question] = relationship(back_populates="options")


class QuestionAsset(Base):
    __tablename__ = "QuestionAsset"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    questionId: Mapped[str] = mapped_column(Text, ForeignKey("Question.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    storageKey: Mapped[str | None] = mapped_column(Text)
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    region: Mapped[object | None] = mapped_column(JSONB)
    caption: Mapped[str | None] = mapped_column(Text)

    question: Mapped[Question] = relationship(back_populates="assets")


class Answer(Base):
    __tablename__ = "Answer"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    questionId: Mapped[str] = mapped_column(Text, ForeignKey("Question.id", ondelete="CASCADE"), unique=True, nullable=False)
    value: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[AnswerStatus] = mapped_column(pg_enum(AnswerStatus, "AnswerStatus"), default=AnswerStatus.MISSING)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    question: Mapped[Question] = relationship(back_populates="answer")
    sources: Mapped[list["AnswerSource"]] = relationship(back_populates="answer")


class AnswerSource(Base):
    __tablename__ = "AnswerSource"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    answerId: Mapped[str] = mapped_column(Text, ForeignKey("Answer.id", ondelete="CASCADE"), nullable=False)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    pages: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    rawText: Mapped[str | None] = mapped_column(Text)
    format: Mapped[str | None] = mapped_column(Text)

    answer: Mapped[Answer] = relationship(back_populates="sources")


class ExtractionWarning(Base):
    __tablename__ = "ExtractionWarning"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    questionId: Mapped[str | None] = mapped_column(Text, ForeignKey("Question.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[ReviewSeverity] = mapped_column(pg_enum(ReviewSeverity, "ReviewSeverity"), default=ReviewSeverity.MEDIUM)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ReviewItem(Base):
    __tablename__ = "ReviewItem"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=uid)
    documentId: Mapped[str] = mapped_column(Text, ForeignKey("Document.id", ondelete="CASCADE"), nullable=False)
    questionId: Mapped[str] = mapped_column(Text, ForeignKey("Question.id", ondelete="CASCADE"), nullable=False)
    severity: Mapped[ReviewSeverity] = mapped_column(pg_enum(ReviewSeverity, "ReviewSeverity"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[ReviewStatus] = mapped_column(pg_enum(ReviewStatus, "ReviewStatus"), default=ReviewStatus.OPEN)
    resolution: Mapped[str | None] = mapped_column(Text)
    actorId: Mapped[str | None] = mapped_column(Text, ForeignKey("User.id", ondelete="SET NULL"))
    resolvedAt: Mapped[datetime | None] = mapped_column(DateTime)
    createdAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    question: Mapped[Question] = relationship(back_populates="reviewItems")
    document: Mapped[Document] = relationship()
