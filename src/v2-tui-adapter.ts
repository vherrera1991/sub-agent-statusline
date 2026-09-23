import type { usePlugin } from "@opencode-ai/plugin/tui";
import type { TuiRuntimeApi } from "./tui-runtime-api.js";

type V2TuiContext = ReturnType<typeof usePlugin>;
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function legacyMessage(value: unknown, sessionID: string): UnknownRecord {
  const message = asRecord(value) ?? {};
  const existingInfo = asRecord(message.info);
  if (existingInfo) {
    return {
      ...message,
      info: { ...existingInfo, sessionID },
      parts: Array.isArray(message.parts) ? message.parts : [],
    };
  }

  const type = asString(message.type);
  const model = asRecord(message.model);
  const info: UnknownRecord = { ...message, role: type, sessionID };
  if (model) {
    info.providerID = model.providerID ?? model.provider;
    info.modelID = model.modelID ?? model.id;
    info.variant = model.variant;
  }

  const content = Array.isArray(message.content) ? message.content : [];
  const parts = content.map((item) => {
    const part = asRecord(item) ?? {};
    if (part.type !== "tool") return { ...part, sessionID };

    const toolState = asRecord(part.state) ?? {};
    return {
      ...part,
      type: "tool",
      tool: asString(part.name) ?? asString(part.tool),
      sessionID,
      messageID: message.id,
      state: {
        ...toolState,
        input: toolState.input ?? toolState.arguments,
        metadata: toolState.metadata,
      },
    };
  });

  return { info, parts };
}

function legacyMessages(values: unknown, sessionID: string): unknown[] {
  return Array.isArray(values)
    ? values.map((message) => legacyMessage(message, sessionID))
    : [];
}

function createDispose(disposers: Array<() => void>): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {
        // Best-effort cleanup keeps other plugin resources disposable.
      }
    }
  };
}

function providersFor(context: V2TuiContext): TuiRuntimeApi["state"]["provider"] {
  const location = context.location ?? context.data.location.default();
  const providers = context.data.location.provider.list(location) ?? [];
  const models = context.data.location.model.list(location) ?? [];

  return providers.map((provider) => {
    const providerModels: Record<string, { name?: string }> = {};
    for (const value of models) {
      const model = value as unknown as UnknownRecord;
      const providerID = asString(model.providerID) ?? asString(model.provider);
      const modelID = asString(model.id) ?? asString(model.modelID);
      if (providerID !== provider.id || !modelID) continue;
      providerModels[modelID] = { name: asString(model.name) };
    }
    return { id: provider.id, models: providerModels };
  });
}

export function createV2TuiApi(context: V2TuiContext): {
  api: TuiRuntimeApi;
  dispose: () => void;
} {
  const location = context.location ?? context.data.location.default();
  const cleanupCallbacks: Array<() => void> = [];
  const keymapLayers: Array<
    Parameters<TuiRuntimeApi["keymap"]["registerLayer"]>[0]
  > = [];
  const disposeSlots = createDispose(cleanupCallbacks);
  const lifecycleCallbacks: Array<() => void> = [];
  const [preferences, updatePreferences] = context.storage.store(
    "sidebar-preferences",
    { initial: {} as Record<string, unknown> },
  );

  const api: TuiRuntimeApi = {
    state: {
      path: { directory: location.directory },
      get provider() {
        return providersFor(context);
      },
      session: {
        status(sessionID) {
          return context.data.session.status(sessionID);
        },
        messages(sessionID) {
          return legacyMessages(
            context.data.session.message.list(sessionID),
            sessionID,
          );
        },
      },
      part(messageID) {
        for (const session of context.data.session.list()) {
          const message = context.data.session.message
            .list(session.id)
            .find((candidate) => candidate.id === messageID);
          if (!message) continue;
          const adapted = legacyMessage(message, session.id);
          const parts = asRecord(adapted)?.parts;
          return Array.isArray(parts) ? parts : [];
        }
        return undefined;
      },
    },
    client: {
      session: {
        async children({ sessionID, directory }) {
          const response = await context.client.session.list({
            directory,
            parentID: sessionID,
            limit: 500,
          });
          return { data: response.data };
        },
        async messages({ sessionID }) {
          const response = await context.client.message.list({ sessionID });
          return {
            data: legacyMessages(response.data, sessionID),
          };
        },
        async status({ directory }) {
          const [sessions, active] = await Promise.all([
            context.client.session.list({ directory, limit: 500 }),
            context.client.session.active(),
          ]);
          return {
            data: Object.fromEntries(
              sessions.data.map((session) => {
                if (active[session.id]) {
                  return [session.id, { status: "running" }];
                }
                if (session.outcome === "failed") {
                  return [
                    session.id,
                    { status: "idle", error: { detail: "Execution failed" } },
                  ];
                }
                return [session.id, { status: "idle" }];
              }),
            ),
          };
        },
      },
    },
    event: {
      on(type, handler) {
        return context.data.listen(({ details }) => {
          if (type === "*" || details.type === type) handler(details);
        });
      },
    },
    lifecycle: {
      onDispose(callback) {
        lifecycleCallbacks.push(callback);
      },
    },
    route: {
      get current() {
        const current = context.ui.router.current();
        return {
          name: current.type,
          params:
            current.type === "session"
              ? { sessionID: current.sessionID }
              : undefined,
        };
      },
      navigate(name, params) {
        if (name === "session" && typeof params?.sessionID === "string") {
          context.ui.router.navigate({
            type: "session",
            sessionID: params.sessionID,
          });
        } else if (name === "home") {
          context.ui.router.navigate({ type: "home" });
        }
      },
    },
    kv: {
      get<Value>(key: string, fallback?: Value): Value {
        return Object.prototype.hasOwnProperty.call(preferences, key)
          ? (preferences[key] as Value)
          : (fallback as Value);
      },
      set(key, value) {
        void updatePreferences((draft) => {
          draft[key] = value;
        });
      },
    },
    ui: {
      toast(input) {
        context.ui.toast.show(input);
      },
      dialog: {
        clear() {
          context.ui.dialog.clear();
        },
      },
    },
    keymap: {
      registerLayer(layer) {
        keymapLayers.push(layer);
        let registered = true;
        return () => {
          if (!registered) return;
          registered = false;
          const index = keymapLayers.indexOf(layer);
          if (index >= 0) keymapLayers.splice(index, 1);
        };
      },
    },
    slots: {
      register(plugin) {
        const slots = plugin.slots;
        const sidebar = slots.sidebar_content;
        const home = slots.home_bottom;
        if (sidebar) {
          cleanupCallbacks.push(
            context.ui.slot({
              append: "sidebar.content",
              render: ({ sessionID }) =>
                sidebar({
                  session_id: sessionID,
                  theme: { current: context.theme },
                }),
            }),
          );
        }
        if (home) {
          cleanupCallbacks.push(
            context.ui.slot({
              append: "home.footer",
              render: () => home({ theme: { current: context.theme } }),
            }),
          );
        }
        if (keymapLayers.length > 0) {
          cleanupCallbacks.push(
            context.ui.slot({
              append: "app",
              render: () => {
                for (const layer of keymapLayers) {
                  const keyForCommand = new Map(
                    layer.bindings.map((binding) => [binding.cmd, binding.key]),
                  );
                  context.keymap.layer(() => ({
                    mode: "global",
                    commands: layer.commands.map((command) => ({
                      id: command.name,
                      title: command.title,
                      description: command.description,
                      group: command.category,
                      bind: keyForCommand.get(command.name) ?? false,
                      palette: true,
                      run: command.run,
                    })),
                    bindings: layer.bindings.map((binding) => binding.cmd),
                  }));
                }
                return null;
              },
            }),
          );
        }
        return "subagent-statusline-v2";
      },
    },
  };

  return {
    api,
    dispose() {
      for (const callback of lifecycleCallbacks.splice(0).reverse()) {
        try {
          callback();
        } catch {
          // Cleanup remains best-effort during reload and shutdown.
        }
      }
      disposeSlots();
    },
  };
}
