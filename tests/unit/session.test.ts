import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { appAiRuntime } from "../../src/services/ai-runtime";
import { prepareRequest } from "../../src/adapters/ai/registry";
import { deferred } from "../helpers/deferred";

describe("actor session and authorization", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("selects only known demo identities and preserves the Actor contract", async () => {
    const { useSessionStore } = await import("../../src/stores/session");
    const session = useSessionStore();
    session.enter("student");
    expect(session.actor).toEqual({
      userId: "user-student-001",
      role: "student",
    });
    session.logout();
    expect(session.actor).toBeNull();
  });

  it("route authorization denies unknown and cross-role actors", async () => {
    const { canAccessRole } = await import("../../src/domain/policy/routes");
    expect(canAccessRole(null, ["admin"])).toBe(false);
    expect(
      canAccessRole({ userId: "user-student-001", role: "student" }, ["admin"]),
    ).toBe(false);
    expect(
      canAccessRole({ userId: "user-admin-001", role: "admin" }, ["admin"]),
    ).toBe(true);
    expect(
      canAccessRole({ userId: "user-counselor-001", role: "counselor" }, [
        "counselor",
        "admin",
      ]),
    ).toBe(true);
  });
  it.each(["switch", "logout"])(
    "AI06 %s aborts real active requests",
    async (action) => {
      const { useSessionStore } = await import("../../src/stores/session");
      const session = useSessionStore();
      session.enter("student");
      const request = await prepareRequest(
          "A1",
          "rewrite",
          {
            resumeVersionId: "v",
            fields: [],
            targetJob: null,
            strategy: "structure",
            keepMyTone: false,
          },
          {},
          0,
        ),
        started = deferred<void>();
      let aborted = false;
      const outcome = appAiRuntime
        .run(request, "LIVE", {
          records: [],
          current: () => ({
            actorUserId: "u",
            epoch: 0,
            domainRevision: request.domainRevision,
          }),
          audit: async () => {},
          live: (req) =>
            new Promise((_resolve, reject) => {
              started.resolve();
              req.signal!.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  reject(new Error("CANCELLED"));
                },
                { once: true },
              );
            }),
        })
        .catch((error) => error);
      await Promise.race([started.promise, outcome]);
      if (action === "switch") session.enter("company");
      else session.logout();
      expect(aborted).toBe(true);
      expect(await outcome).toMatchObject({ code: "CANCELLED" });
    },
  );
});
