import { describe, expect, it } from "vitest";
import { applySubagentEvent } from "./events.js";
import { createEmptyState } from "./state.js";

const created = {
  id: "evt_created",
  created: 1_778_123_456_000,
  type: "session.created",
  data: {
    sessionID: "ses_child_v2",
    parentID: "ses_parent_v2",
    title: "Inspect the migration",
    agent: "researcher",
    model: { providerID: "openai", modelID: "gpt-6" },
  },
};

describe("OpenCode v2 session events", () => {
  it("tracks child sessions from v2 session.created data", () => {
    const state = createEmptyState();

    expect(applySubagentEvent(state, created)).toBe(true);
    expect(state.children.ses_child_v2).toMatchObject({
      id: "ses_child_v2",
      parentID: "ses_parent_v2",
      targetSessionID: "ses_child_v2",
      title: "Inspect the migration",
      status: "running",
      source: "session",
    });
  });

  it("marks v2 successful executions as done", () => {
    const state = createEmptyState();
    applySubagentEvent(state, created);

    expect(
      applySubagentEvent(state, {
        id: "evt_succeeded",
        created: 1_778_123_460_000,
        type: "session.execution.succeeded",
        data: { sessionID: "ses_child_v2" },
      }),
    ).toBe(true);
    expect(state.children.ses_child_v2?.status).toBe("done");
  });

  it("marks v2 failed executions as errors", () => {
    const state = createEmptyState();
    applySubagentEvent(state, created);

    expect(
      applySubagentEvent(state, {
        id: "evt_failed",
        created: 1_778_123_460_000,
        type: "session.execution.failed",
        data: {
          sessionID: "ses_child_v2",
          error: { message: "The child session failed" },
        },
      }),
    ).toBe(true);
    expect(state.children.ses_child_v2?.status).toBe("error");
  });
});
