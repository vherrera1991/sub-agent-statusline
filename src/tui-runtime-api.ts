import type { usePlugin } from "@opencode-ai/plugin/tui";
import type { JSX } from "@opentui/solid";

export type TuiThemeCurrent = ReturnType<typeof usePlugin>["theme"];

export type TuiSlotContext = {
  theme: {
    current: TuiThemeCurrent;
  };
};

export type TuiProvider = {
  id: string;
  models: Record<string, { name?: string }>;
};

export type TuiRuntimeApi = {
  state: {
    path: { directory: string };
    provider: readonly TuiProvider[];
    session: {
      status: (sessionID: string) => unknown;
      messages: (sessionID: string) => unknown[] | undefined;
    };
    part: (messageID: string) => unknown[] | undefined;
  };
  client: {
    session: {
      children: (input: {
        sessionID: string;
        directory: string;
      }) => Promise<{ data: unknown[] }>;
      messages: (input: {
        sessionID: string;
        directory: string;
      }) => Promise<{ data: unknown[] }>;
      status: (input: {
        directory: string;
      }) => Promise<{ data: Record<string, unknown> }>;
    };
  };
  event: {
    on: (type: string, handler: (event: unknown) => void) => () => void;
  };
  lifecycle: {
    onDispose: (callback: () => void) => void;
  };
  route: {
    current: {
      name: string;
      params?: Record<string, unknown>;
    };
    navigate: (name: string, params?: Record<string, unknown>) => void;
  };
  kv: {
    get: <Value>(key: string, fallback?: Value) => Value;
    set: (key: string, value: unknown) => void;
  };
  ui: {
    toast: (input: {
      variant?: "info" | "success" | "warning" | "error";
      message: string;
    }) => void;
    dialog: { clear: () => void };
  };
  keymap: {
    registerLayer: (layer: {
      commands: Array<{
        name: string;
        title: string;
        description?: string;
        category?: string;
        run: () => void;
      }>;
      bindings: Array<{ key: string; cmd: string }>;
    }) => () => void;
  };
  slots: {
    register: (plugin: {
      order?: number;
      slots: Record<
        string,
        (context: TuiSlotContext & { session_id?: string }) => JSX.Element
      >;
    }) => string;
  };
};
