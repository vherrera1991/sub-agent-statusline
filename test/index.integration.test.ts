import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SubagentStatuslineRuntime } from "../src/runtime.js";
import type { StatuslineState } from "../src/state.js";
import {
  createRuntimeHarness,
  pathExists,
  readRuntimeState,
  readStatusText,
} from "./helpers/runtime-harness.js";

async function runRuntimePlugin(events: unknown[] = []): Promise<void> {
  let finishStream: () => void = () => {};
  const streamFinished = new Promise<void>((resolve) => {
    finishStream = resolve;
  });
  const stream = async function* () {
    try {
      yield* events;
    } finally {
      finishStream();
    }
  };
  const cleanup = await SubagentStatuslineRuntime.setup({
    event: { subscribe: () => stream() },
  } as never);

  await streamFinished;
  if (typeof cleanup === "function") cleanup();
}

describe("SubagentStatusline runtime", () => {
  it("initializes empty runtime files and persists supported event changes", async () => {
    const harness = await createRuntimeHarness();
    const event = {
      id: "evt_created",
      created: Date.now(),
      type: "session.created",
      data: {
        sessionID: "ses_child_1",
        parentID: "ses_parent_1",
        title: "Review auth changes",
        agent: "reviewer",
      },
    };

    await runRuntimePlugin([event]);

    expect(await readStatusText(harness.textPath)).toContain("Review auth changes");

    const state = await readRuntimeState<StatuslineState>(harness.statePath);
    expect(state.children.ses_child_1).toMatchObject({
      title: "Review auth changes",
      status: "running",
    });
    expect(await readStatusText(harness.textPath)).toContain("Review auth changes");
  });

  it("preserves startup state when preserve-state is enabled", async () => {
    const harness = await createRuntimeHarness({ preserveState: true });
    await writeFile(
      harness.statePath,
      JSON.stringify({
        children: {},
        countedChildIDs: { existing: true },
        totalExecuted: 7,
        updatedAt: "2026-04-30T10:00:00.000Z",
      }),
      "utf8",
    );

    await runRuntimePlugin();

    expect(await readRuntimeState<StatuslineState>(harness.statePath)).toMatchObject({
      totalExecuted: 7,
      countedChildIDs: { existing: true },
    });
    expect(await pathExists(harness.textPath)).toBe(false);
  });

  it("handles malformed events and write failures without throwing", async () => {
    const harness = await createRuntimeHarness({ preserveState: true });
    await mkdir(harness.statePath, { recursive: true });
    await runRuntimePlugin([
      null,
      {
        id: "evt_created",
        created: Date.now(),
        type: "session.created",
        data: {
          sessionID: "ses_child_1",
          parentID: "ses_parent_1",
          title: "Review auth changes",
        },
      },
    ]);
  });
});
