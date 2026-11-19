import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import {
  createRepository,
  storageMessage,
} from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";
const db = createDatabase(`attachments-${crypto.randomUUID()}`),
  repo = createRepository(db);
afterEach(async () => {
  await db.delete();
});
it("D06 stores readable real PDF blobs and rejects wrong MIME, oversize, unauthorized", async () => {
  await repo.initialize();
  const sample = await db.attachments.get("attachment-001");
  expect((await sample!.blob.text()).startsWith("%PDF-")).toBe(true);
  const blob = new Blob(["demo"], { type: "application/pdf" });
  const attachment = await repo.addAttachment(
    demoActors.student,
    { fileName: "demo.pdf", blob },
    fixedClock,
  );
  expect(
    await (
      await repo.readAttachment(demoActors.student, attachment.id)
    ).blob.text(),
  ).toBe("demo");
  await expect(
    repo.readAttachment(demoActors.company, attachment.id),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    repo.addAttachment(
      demoActors.student,
      { fileName: "bad.txt", blob: new Blob(["text"], { type: "text/plain" }) },
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(
    repo.addAttachment(
      demoActors.student,
      {
        fileName: "large.pdf",
        blob: new Blob([new Uint8Array(2097153)], { type: "application/pdf" }),
      },
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("D07 quota and blocked/open errors have explicit no-memory-fallback messages", () => {
  expect(
    storageMessage(new DOMException("quota", "QuotaExceededError")),
  ).toContain("草稿未丢弃");
  expect(storageMessage(new DOMException("blocked", "VersionError"))).toContain(
    "关闭其他",
  );
  expect(storageMessage(new Error("unknown"))).toContain("未切换");
});
