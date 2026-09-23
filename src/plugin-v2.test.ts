import { describe, expect, it } from "vitest";

type V2PluginDefinition = {
  id?: unknown;
  setup?: unknown;
};

describe("OpenCode v2 plugin entrypoints", () => {
  it("exports a server plugin definition with a stable ID and setup", async () => {
    const module = await import("./index.js");
    const plugin = (module as { default?: V2PluginDefinition }).default;

    expect(plugin?.id).toBe("opencode-subagent-statusline");
    expect(plugin?.setup).toBeTypeOf("function");
  });

  it("exports a CLI plugin definition with a stable ID and setup", async () => {
    const module = await import("./tui.js");
    const plugin = (module as { default?: V2PluginDefinition }).default;

    expect(plugin?.id).toBe("subagent-statusline.tui");
    expect(plugin?.setup).toBeTypeOf("function");
  });
});
