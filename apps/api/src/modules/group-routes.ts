import type { FastifyInstance } from "fastify";
import { AppError } from "@folio/shared";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../lib/pagination.js";
import { authenticate, requireDocument } from "../plugins/auth.js";
import { addGroupDocumentBody, createGroupBody, createRelationshipBody, paginationQuery } from "./schemas.js";
import { serializeDocument } from "./serializers.js";

export async function groupRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/document-groups",
    { schema: { tags: ["Document Groups"], summary: "Create a document group" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const body = createGroupBody.parse(request.body);
      const group = await prisma.documentGroup.create({
        data: { ownerId: user.id, name: body.name, description: body.description },
      });
      return reply.status(201).send({ group });
    },
  );

  app.get(
    "/api/v1/document-groups",
    { schema: { tags: ["Document Groups"], summary: "List document groups" } },
    async (request) => {
      const user = await authenticate(request);
      const query = paginationQuery.parse(request.query);
      const { page, limit, skip } = parsePagination(query);
      const where = { ownerId: user.id };
      const [items, total] = await Promise.all([
        prisma.documentGroup.findMany({
          where,
          include: {
            members: { include: { document: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.documentGroup.count({ where }),
      ]);
      return paginated(
        items.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          createdAt: g.createdAt,
          documents: g.members.map((m) => ({
            role: m.role,
            document: serializeDocument(m.document),
          })),
        })),
        total,
        page,
        limit,
      );
    },
  );

  app.get(
    "/api/v1/document-groups/:id",
    { schema: { tags: ["Document Groups"], summary: "Get a document group" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const group = await prisma.documentGroup.findFirst({
        where: { id, ownerId: user.id },
        include: { members: { include: { document: true } } },
      });
      if (!group) throw new AppError("GROUP_NOT_FOUND", "Document group was not found.", 404);
      return {
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          createdAt: group.createdAt,
          documents: group.members.map((m) => ({
            role: m.role,
            document: serializeDocument(m.document),
          })),
        },
      };
    },
  );

  app.post(
    "/api/v1/document-groups/:id/documents",
    { schema: { tags: ["Document Groups"], summary: "Add a document to a group" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const body = addGroupDocumentBody.parse(request.body);
      const group = await prisma.documentGroup.findFirst({ where: { id, ownerId: user.id } });
      if (!group) throw new AppError("GROUP_NOT_FOUND", "Document group was not found.", 404);
      const document = await requireDocument(user.id, body.documentId);
      const member = await prisma.documentGroupMember.upsert({
        where: { groupId_documentId: { groupId: group.id, documentId: document.id } },
        update: { role: body.role },
        create: { groupId: group.id, documentId: document.id, role: body.role },
      });
      if (body.role === "ANSWER_KEY") {
        const paper = await prisma.documentGroupMember.findFirst({
          where: { groupId: group.id, role: "QUESTION_PAPER", documentId: { not: document.id } },
        });
        if (paper) {
          await prisma.documentRelationship.upsert({
            where: {
              sourceDocumentId_targetDocumentId_type: {
                sourceDocumentId: paper.documentId,
                targetDocumentId: document.id,
                type: "ANSWER_KEY_FOR",
              },
            },
            update: {},
            create: {
              sourceDocumentId: paper.documentId,
              targetDocumentId: document.id,
              type: "ANSWER_KEY_FOR",
            },
          });
        }
      }
      return reply.status(201).send({ member });
    },
  );

  app.delete(
    "/api/v1/document-groups/:id/documents/:documentId",
    { schema: { tags: ["Document Groups"], summary: "Remove a document from a group" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id, documentId } = request.params as { id: string; documentId: string };
      const group = await prisma.documentGroup.findFirst({ where: { id, ownerId: user.id } });
      if (!group) throw new AppError("GROUP_NOT_FOUND", "Document group was not found.", 404);
      await prisma.documentGroupMember.deleteMany({ where: { groupId: group.id, documentId } });
      return reply.status(204).send();
    },
  );

  app.post(
    "/api/v1/documents/:id/relationships",
    { schema: { tags: ["Document Groups"], summary: "Create a document relationship" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const body = createRelationshipBody.parse(request.body);
      const source = await requireDocument(user.id, id);
      const target = await requireDocument(user.id, body.targetDocumentId);
      const relationship = await prisma.documentRelationship.upsert({
        where: {
          sourceDocumentId_targetDocumentId_type: {
            sourceDocumentId: source.id,
            targetDocumentId: target.id,
            type: body.type,
          },
        },
        update: {},
        create: {
          sourceDocumentId: source.id,
          targetDocumentId: target.id,
          type: body.type,
        },
      });
      return reply.status(201).send({ relationship });
    },
  );
}
