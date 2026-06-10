import { useEffect, useMemo, useState } from "react";
import { v4 } from "../utils/uuid";
import {
  buildDefaultShortcutBindings,
  SHORTCUT_ACTIONS,
  useShortcutStore,
} from "../stores/shortcutStore";
import type { ShortcutBinding } from "../types";

function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === " ") return "space";
  if (lower === "arrowleft") return "left";
  if (lower === "arrowright") return "right";
  if (lower === "arrowup") return "up";
  if (lower === "arrowdown") return "down";
  return lower;
}

function makeBinding(actionId: string): ShortcutBinding {
  return {
    id: v4(),
    action_id: actionId,
    key: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    enabled: true,
  };
}

export function ShortcutsPanel() {
  const bindings = useShortcutStore((s) => s.bindings);
  const updateBinding = useShortcutStore((s) => s.updateBinding);
  const replaceBindings = useShortcutStore((s) => s.replaceBindings);
  const saveBindings = useShortcutStore((s) => s.saveBindings);
  const formatBindingCombo = useShortcutStore((s) => s.formatBindingCombo);

  const [capturingBindingId, setCapturingBindingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const byAction = new Set(bindings.map((binding) => binding.action_id));
    const missing = SHORTCUT_ACTIONS.filter((action) => !byAction.has(action.id)).map((action) =>
      makeBinding(action.id)
    );
    if (missing.length > 0) {
      replaceBindings([...bindings, ...missing]);
    }
  }, [bindings, replaceBindings]);

  const bindingByAction = useMemo(() => {
    const map = new Map<string, ShortcutBinding>();
    for (const binding of bindings) {
      if (!map.has(binding.action_id)) {
        map.set(binding.action_id, binding);
      }
    }
    return map;
  }, [bindings]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Keyboard Shortcuts</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              replaceBindings(buildDefaultShortcutBindings());
              setError(null);
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await saveBindings();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan disabled:opacity-50"
          >
            Save Bindings
          </button>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-1 max-h-[480px] overflow-auto">
        {SHORTCUT_ACTIONS.map((action) => {
          const binding = bindingByAction.get(action.id);
          if (!binding) return null;
          return (
            <div key={action.id} className="rounded border border-deck-border p-2 text-[11px] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-deck-text">{action.label}</p>
                  <p className="text-[10px] text-deck-text-muted">{action.description}</p>
                </div>
                <label className="text-[10px] text-deck-text-muted flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={binding.enabled}
                    onChange={(event) =>
                      updateBinding(binding.id, {
                        enabled: event.target.checked,
                      })
                    }
                  />
                  enabled
                </label>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setCapturingBindingId(binding.id)}
                  onBlur={() => {
                    if (capturingBindingId === binding.id) {
                      setCapturingBindingId(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (capturingBindingId !== binding.id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    updateBinding(binding.id, {
                      key: normalizeKey(event.key),
                    });
                    setCapturingBindingId(null);
                  }}
                  className={[
                    "text-left rounded border px-2 py-1 text-[11px]",
                    capturingBindingId === binding.id
                      ? "border-deck-magenta/50 bg-deck-magenta/10 text-deck-magenta"
                      : "border-deck-border bg-deck-surface text-deck-text-muted",
                  ].join(" ")}
                >
                  {capturingBindingId === binding.id ? "Press a key..." : formatBindingCombo(binding)}
                </button>
                <div className="flex gap-1 text-[10px]">
                  <label className="px-1 py-0.5 rounded border border-deck-border">
                    <input
                      type="checkbox"
                      checked={binding.ctrl}
                      onChange={(event) => updateBinding(binding.id, { ctrl: event.target.checked })}
                    />
                    C
                  </label>
                  <label className="px-1 py-0.5 rounded border border-deck-border">
                    <input
                      type="checkbox"
                      checked={binding.alt}
                      onChange={(event) => updateBinding(binding.id, { alt: event.target.checked })}
                    />
                    A
                  </label>
                  <label className="px-1 py-0.5 rounded border border-deck-border">
                    <input
                      type="checkbox"
                      checked={binding.shift}
                      onChange={(event) => updateBinding(binding.id, { shift: event.target.checked })}
                    />
                    S
                  </label>
                  <label className="px-1 py-0.5 rounded border border-deck-border">
                    <input
                      type="checkbox"
                      checked={binding.meta}
                      onChange={(event) => updateBinding(binding.id, { meta: event.target.checked })}
                    />
                    M
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
