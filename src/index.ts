import { Plugin } from "@opencode-ai/plugin";

export const SubagentStatusline = Plugin.define({
  id: "opencode-subagent-statusline",
  setup() {},
});

export default Object.assign(SubagentStatusline, { tui: true });
