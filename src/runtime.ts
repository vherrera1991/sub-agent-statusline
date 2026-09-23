import { Plugin } from "@opencode-ai/plugin";
import { applySubagentEvent } from "./events.js";
import { renderStatusLine } from "./render.js";
import {
  createEmptyState,
  loadState,
  resolveStatePath,
  resolveTextPath,
  saveState,
  saveStatusText,
  shouldPreserveStateOnStartup,
} from "./state.js";

export const SubagentStatuslineRuntime = Plugin.define({
  id: "opencode-subagent-statusline.runtime",
  async setup(context) {
    const statePath = resolveStatePath();
    const textPath = resolveTextPath(statePath);

    if (!shouldPreserveStateOnStartup()) {
      try {
        const emptyState = createEmptyState();
        await saveState(statePath, emptyState);
        await saveStatusText(textPath, renderStatusLine(emptyState));
      } catch {
        // Initialization failure should not prevent OpenCode from starting.
      }
    }

    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of context.event.subscribe({
          signal: controller.signal,
        })) {
          try {
            const state = await loadState(statePath);
            if (!applySubagentEvent(state, event)) continue;
            await saveState(statePath, state);
            await saveStatusText(textPath, renderStatusLine(state));
          } catch {
            // Event and persistence failures must not crash OpenCode.
          }
        }
      } catch {
        // Aborting the event stream is expected during plugin unload.
      }
    })();

    return () => controller.abort();
  },
});

export default SubagentStatuslineRuntime;
