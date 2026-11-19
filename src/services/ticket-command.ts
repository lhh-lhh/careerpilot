import type { Database } from "../adapters/repository/db";
import type { AuditLog, Feedback, Json, User } from "../types/entities";
import { requireCondition } from "../domain/errors";
export type TicketCommand = {
  commandId: string;
  entityId: string;
  expectedRevision: number;
} & (
  | { type: "CREATE_TICKET"; payload: { body: string } }
  | {
      type: "TICKET_ACTION";
      payload: { action: "REPLY" | "CLOSE" | "REOPEN"; text: string };
    }
);
export async function executeTicket(
  db: Database,
  command: TicketCommand,
  user: User,
  now: string,
  audit: (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>,
): Promise<Json> {
  const before =
    command.type === "CREATE_TICKET"
      ? undefined
      : await db.feedback.get(command.entityId);
  const owner =
    before?.ownerUserId ??
    (before?.studentId
      ? (await db.students.get(before.studentId))?.userId
      : undefined);
  if (command.type === "TICKET_ACTION")
    requireCondition(
      before && (owner === user.id || user.role === "admin"),
      "FORBIDDEN",
    );
  if (command.type === "CREATE_TICKET")
    requireCondition(
      command.expectedRevision === 0 &&
        !(await db.feedback.get(command.entityId)),
      "ALREADY_EXISTS",
    );
  else
    requireCondition(
      before!.revision === command.expectedRevision,
      "REVISION_CONFLICT",
    );
  const text =
    command.type === "CREATE_TICKET"
      ? command.payload.body
      : command.payload.text;
  requireCondition(
    typeof text === "string" && text.trim().length >= 4 && text.length <= 2000,
    "VALIDATION_ERROR",
  );
  let ticket: Feedback;
  if (command.type === "CREATE_TICKET")
    ticket = {
      id: command.entityId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ownerUserId: user.id,
      studentId: user.studentId ?? null,
      body: text.trim().normalize("NFC"),
      reply: null,
      status: "open",
      history: [],
    };
  else {
    const action = command.payload.action;
    requireCondition(
      ["REPLY", "CLOSE", "REOPEN"].includes(action),
      "INVALID_TRANSITION",
    );
    requireCondition(
      action === "REOPEN"
        ? owner === user.id
        : user.role === "admin" && owner !== user.id,
      "FORBIDDEN",
    );
    requireCondition(
      action === "REPLY"
        ? before!.status !== "closed"
        : action === "CLOSE"
          ? before!.status === "replied"
          : before!.status !== "open",
      "INVALID_TRANSITION",
    );
    ticket = {
      ...before!,
      revision: before!.revision + 1,
      updatedAt: now,
      status:
        action === "REPLY" ? "replied" : action === "CLOSE" ? "closed" : "open",
      reply: action === "REPLY" ? text.trim().normalize("NFC") : before!.reply,
      history: [
        ...(before!.history ?? []),
        {
          action,
          text: text.trim().normalize("NFC"),
          at: now,
          by: action === "REOPEN" ? "owner" : "admin",
        },
      ],
    };
  }
  await db.feedback.put(ticket);
  await audit({
    entityType: "ServiceTicket",
    entityId: ticket.id,
    action: command.type,
    actorUserId: user.id,
    commandId: command.commandId,
    at: now,
    reason: null,
    before: before ? { status: before.status } : null,
    after: { status: ticket.status },
  });
  return { entityId: ticket.id, revision: ticket.revision };
}
