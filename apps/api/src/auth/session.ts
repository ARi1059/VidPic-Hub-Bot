import type { FastifyRequest } from "fastify";

export interface RequestSession {
  userId: string;
  telegramUserId: string;
  displayName: string;
  memberActive: boolean;
  memberExpiresAt: Date | null;
  adminId: string | null;
  permissions: string[];
  audience: "user" | "admin";
}

export type AuthenticatedRequest = FastifyRequest & { session: RequestSession };

export function getRequestSession(request: FastifyRequest): RequestSession {
  const session = (request as Partial<AuthenticatedRequest>).session;
  if (!session) throw new Error("Authenticated request session is missing");
  return session;
}
