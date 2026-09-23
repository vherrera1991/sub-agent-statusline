import { describe, expect, it, vi } from "vitest";
import { createV2TuiApi } from "./v2-tui-adapter.js";

function createContext() {
  let onEvent: ((event: { details: unknown }) => void) | undefined;
  const slotClaims: unknown[] = [];
  const slotDisposers = [vi.fn(), vi.fn()];
  let slotIndex = 0;
  const message = {
    id: "msg_1",
    type: "assistant",
    model: { providerID: "openai", modelID: "gpt-6", variant: "high" },
    content: [
      {
        type: "tool",
        id: "tool_1",
        name: "task",
        state: { status: "running", input: { description: "Inspect tests" } },
      },
    ],
  };
  const context = {
    location: { directory: "/repo" },
    theme: {},
    client: {
      message: {
        list: vi.fn(async () => ({ data: [message], cursor: {} })),
      },
      session: {
        list: vi.fn(async () => ({ data: [], cursor: {} })),
        active: vi.fn(async () => ({})),
      },
    },
    data: {
      listen: vi.fn((handler: (event: { details: unknown }) => void) => {
        onEvent = handler;
        return vi.fn();
      }),
      location: {
        default: () => ({ directory: "/repo" }),
        provider: { list: () => [{ id: "openai" }] },
        model: {
          list: () => [
            { id: "gpt-6", providerID: "openai", name: "GPT 6" },
          ],
        },
      },
      session: {
        list: () => [{ id: "ses_1" }],
        status: () => "running",
        message: {
          list: () => [message],
        },
      },
    },
    storage: {
      store: () => [{}, async () => {}],
    },
    ui: {
      router: {
        current: () => ({ type: "home" }),
        navigate: vi.fn(),
      },
      toast: { show: vi.fn() },
      dialog: { clear: vi.fn() },
      slot: (claim: unknown) => {
        slotClaims.push(claim);
        const disposer = slotDisposers[slotIndex];
        slotIndex += 1;
        return disposer ?? vi.fn();
      },
    },
    keymap: { layer: vi.fn() },
  };

  return {
    context,
    emit(event: unknown) {
      onEvent?.({ details: event });
    },
    slotClaims,
    slotDisposers,
  };
}

describe("OpenCode v2 TUI adapter", () => {
  it("adapts v2 messages and tool content for the existing status model", async () => {
    const { context } = createContext();
    const bridge = createV2TuiApi(context as never);

    const response = await bridge.api.client.session.messages({
      sessionID: "ses_1",
      directory: "/repo",
    });

    expect(response.data[0]).toMatchObject({
      info: {
        role: "assistant",
        sessionID: "ses_1",
        providerID: "openai",
        modelID: "gpt-6",
      },
      parts: [
        {
          type: "tool",
          tool: "task",
          state: { input: { description: "Inspect tests" } },
        },
      ],
    });
    bridge.dispose();
  });

  it("registers v2 slots and forwards event stream notifications", () => {
    const { context, emit, slotClaims, slotDisposers } = createContext();
    const bridge = createV2TuiApi(context as never);
    const received: unknown[] = [];
    const unsubscribe = bridge.api.event.on("*", (event) => received.push(event));

    bridge.api.slots.register({
      slots: {
        sidebar_content: ({ session_id }) => `sidebar:${session_id}` as never,
        home_bottom: () => "home" as never,
      },
    });
    emit({ type: "session.created", data: { sessionID: "ses_1" } });

    expect(received).toMatchObject([
      { type: "session.created", data: { sessionID: "ses_1" } },
    ]);
    expect((slotClaims[0] as { append: string }).append).toBe("sidebar.content");
    expect(
      (slotClaims[0] as { render: (input: { sessionID: string }) => unknown }).render({
        sessionID: "ses_1",
      }),
    ).toBe("sidebar:ses_1");
    expect((slotClaims[1] as { append: string }).append).toBe("home.footer");

    unsubscribe();
    bridge.dispose();
    expect(slotDisposers[0]).toHaveBeenCalledOnce();
    expect(slotDisposers[1]).toHaveBeenCalledOnce();
  });

  it("registers keymap layers from the app slot render context", () => {
    const { context, slotClaims } = createContext();
    const bridge = createV2TuiApi(context as never);

    bridge.api.keymap.registerLayer({
      commands: [
        {
          name: "subagent-statusline.test",
          title: "Test command",
          run: vi.fn(),
        },
      ],
      bindings: [{ key: "alt+b", cmd: "subagent-statusline.test" }],
    });

    expect(context.keymap.layer).not.toHaveBeenCalled();
    bridge.api.slots.register({ slots: {} });

    const appSlot = slotClaims.find(
      (claim) => (claim as { append?: string }).append === "app",
    ) as { render: () => unknown } | undefined;
    expect(appSlot).toBeDefined();
    appSlot?.render();

    expect(context.keymap.layer).toHaveBeenCalledOnce();
    bridge.dispose();
  });
});
