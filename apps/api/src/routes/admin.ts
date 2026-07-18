import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { requireRole } from "../middleware/auth.js";
import {
  adminQueue,
  approveListingDraft,
  approveSellerApplication,
  rejectSellerApplication,
  requestListingRevision
} from "../services/adminOperations.js";

export async function registerAdminRoutes(app: FastifyInstance, db: Db) {
  app.get("/admin/review-queue", async (request, reply) => {
    await requireRole(db, request, reply, "admin");
    return adminQueue(db);
  });

  app.post("/admin/seller-applications/:application_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveSellerApplication(
      db,
      account,
      (request.params as any).application_id,
      (request.body as any)?.notes ?? "Approved by admin."
    );
  });

  app.post("/admin/seller-applications/:application_id/reject", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return rejectSellerApplication(
      db,
      account,
      (request.params as any).application_id,
      (request.body as any)?.notes ?? "Rejected by admin."
    );
  });

  app.post("/admin/listing-drafts/:draft_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveListingDraft(
      db,
      account,
      (request.params as any).draft_id,
      (request.body as any)?.notes ?? "Listing published as limited evidence."
    );
  });

  app.post("/admin/listing-drafts/:draft_id/revision", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return requestListingRevision(
      db,
      account,
      (request.params as any).draft_id,
      (request.body as any)?.notes ?? "Revision requested."
    );
  });
}
