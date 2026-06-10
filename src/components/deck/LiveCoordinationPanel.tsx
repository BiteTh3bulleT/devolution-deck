import { useEffect, useState } from "react";
import type {
  DeckEventBinding,
  DeckSceneLink,
  LibraryItem,
  Scene,
  ShowTrigger,
} from "../../types";
import { v4 } from "../../utils/uuid";

interface LiveCoordinationPanelProps {
  scenes: Scene[];
  libraryItems: LibraryItem[];
  showTriggers: ShowTrigger[];
  deckEventBindings: DeckEventBinding[];
  deckSceneLinks: DeckSceneLink[];
  onUpsertShowTrigger: (trigger: ShowTrigger) => Promise<void>;
  onRemoveShowTrigger: (triggerId: string) => Promise<void>;
  onExecuteShowTrigger: (triggerId: string) => Promise<string>;
  onUpsertDeckEventBinding: (binding: DeckEventBinding) => Promise<void>;
  onRemoveDeckEventBinding: (bindingId: string) => Promise<void>;
  onUpsertDeckSceneLink: (link: DeckSceneLink) => Promise<void>;
  onRemoveDeckSceneLink: (linkId: string) => Promise<void>;
  onCoordinateScene: (sceneId: string) => Promise<string[]>;
}

const EVENTS = ["deck_start", "deck_stop", "cue_trigger", "loop_on", "pad_trigger", "scene_coordinate"];

export function LiveCoordinationPanel({
  scenes,
  libraryItems,
  showTriggers,
  deckEventBindings,
  deckSceneLinks,
  onUpsertShowTrigger,
  onRemoveShowTrigger,
  onExecuteShowTrigger,
  onUpsertDeckEventBinding,
  onRemoveDeckEventBinding,
  onUpsertDeckSceneLink,
  onRemoveDeckSceneLink,
  onCoordinateScene,
}: LiveCoordinationPanelProps) {
  const [newTriggerName, setNewTriggerName] = useState("FX Pulse");
  const [newTriggerProtocol, setNewTriggerProtocol] = useState("osc");
  const [lastTriggerPayload, setLastTriggerPayload] = useState("");

  const [bindingEvent, setBindingEvent] = useState(EVENTS[0]);
  const [bindingDeckId, setBindingDeckId] = useState("A");
  const [bindingTriggerId, setBindingTriggerId] = useState("");

  const [linkSceneId, setLinkSceneId] = useState(scenes[0]?.id ?? "");
  const [linkDeckId, setLinkDeckId] = useState("A");
  const [linkLibraryItemId, setLinkLibraryItemId] = useState(libraryItems[0]?.id ?? "");
  const [coordinationLog, setCoordinationLog] = useState<string[]>([]);

  useEffect(() => {
    if (!scenes.some((scene) => scene.id === linkSceneId)) {
      setLinkSceneId(scenes[0]?.id ?? "");
    }
  }, [scenes, linkSceneId]);

  useEffect(() => {
    if (!libraryItems.some((item) => item.id === linkLibraryItemId)) {
      setLinkLibraryItemId(libraryItems[0]?.id ?? "");
    }
  }, [libraryItems, linkLibraryItemId]);

  return (
    <section className="rounded border border-deck-border bg-deck-panel/90 p-3 space-y-3">
      <h3 className="text-[11px] uppercase tracking-widest text-deck-cyan">MIDI/OSC & Scene Coordination</h3>

      <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Show Triggers</p>
        <div className="grid grid-cols-[1fr_90px_auto] gap-1">
          <input
            value={newTriggerName}
            onChange={(event) => setNewTriggerName(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1 text-[11px]"
            placeholder="Trigger name"
          />
          <select
            value={newTriggerProtocol}
            onChange={(event) => setNewTriggerProtocol(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1 text-[11px]"
          >
            <option value="osc">OSC</option>
            <option value="midi">MIDI</option>
          </select>
          <button
            type="button"
            onClick={() => {
              const trigger: ShowTrigger = {
                id: v4(),
                name: newTriggerName.trim() || "Trigger",
                enabled: true,
                value: 1,
                quantize_beats: 4,
              };
              if (newTriggerProtocol === "midi") {
                trigger.midi_binding = {
                  channel: 1,
                  status: "note_on",
                  data1: 60,
                  data2: 127,
                };
              } else {
                trigger.osc_binding = {
                  address: "/devolution/trigger",
                  host: "127.0.0.1",
                  port: 9000,
                  argument_type: "f32",
                };
              }
              void onUpsertShowTrigger(trigger);
            }}
            className="px-2 py-1 rounded border border-deck-border text-[11px]"
          >
            + Trigger
          </button>
        </div>

        <div className="space-y-1 max-h-28 overflow-auto text-[10px]">
          {showTriggers.map((trigger) => (
            <div key={trigger.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-deck-text-muted">{trigger.name}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    const payload = await onExecuteShowTrigger(trigger.id);
                    setLastTriggerPayload(payload);
                  }}
                  className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                >
                  Execute
                </button>
                <button
                  type="button"
                  onClick={() => void onRemoveShowTrigger(trigger.id)}
                  className="text-red-300"
                >
                  Del
                </button>
              </div>
            </div>
          ))}
        </div>

        {lastTriggerPayload && (
          <p className="text-[10px] text-deck-cyan break-all">{lastTriggerPayload}</p>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Deck Event Bindings</p>
        <div className="grid grid-cols-[1fr_70px_1fr_auto] gap-1 text-[11px]">
          <select
            value={bindingEvent}
            onChange={(event) => setBindingEvent(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            {EVENTS.map((eventName) => (
              <option key={eventName} value={eventName}>
                {eventName}
              </option>
            ))}
          </select>
          <select
            value={bindingDeckId}
            onChange={(event) => setBindingDeckId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            <option value="">Any</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <select
            value={bindingTriggerId}
            onChange={(event) => setBindingTriggerId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            <option value="">Select trigger</option>
            {showTriggers.map((trigger) => (
              <option key={trigger.id} value={trigger.id}>
                {trigger.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bindingTriggerId}
            onClick={() =>
              void onUpsertDeckEventBinding({
                id: v4(),
                event: bindingEvent,
                deck_id: bindingDeckId || undefined,
                show_trigger_id: bindingTriggerId,
                enabled: true,
              })
            }
            className="px-2 py-1 rounded border border-deck-border disabled:opacity-40"
          >
            +
          </button>
        </div>

        <div className="space-y-1 max-h-24 overflow-auto text-[10px]">
          {deckEventBindings.map((binding) => (
            <div key={binding.id} className="rounded border border-deck-border p-1 flex items-center justify-between">
              <span className="text-deck-text-muted truncate">
                {binding.event} ({binding.deck_id ?? "any"})
              </span>
              <button
                type="button"
                onClick={() => void onRemoveDeckEventBinding(binding.id)}
                className="text-red-300"
              >
                Del
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Scene → Deck Links</p>
        <div className="grid grid-cols-[1fr_70px_1fr_auto] gap-1 text-[11px]">
          <select
            value={linkSceneId}
            onChange={(event) => setLinkSceneId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            <option value="">Scene</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <select
            value={linkDeckId}
            onChange={(event) => setLinkDeckId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <select
            value={linkLibraryItemId}
            onChange={(event) => setLinkLibraryItemId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1"
          >
            <option value="">No autoload</option>
            {libraryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.artist} - {item.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!linkSceneId}
            onClick={() =>
              void onUpsertDeckSceneLink({
                id: v4(),
                scene_id: linkSceneId,
                preferred_deck_id: linkDeckId,
                library_item_id: linkLibraryItemId || undefined,
                auto_load: Boolean(linkLibraryItemId),
              })
            }
            className="px-2 py-1 rounded border border-deck-border disabled:opacity-40"
          >
            +
          </button>
        </div>

        <div className="space-y-1 max-h-24 overflow-auto text-[10px]">
          {deckSceneLinks.map((link) => (
            <div key={link.id} className="rounded border border-deck-border p-1 flex items-center justify-between">
              <span className="text-deck-text-muted truncate">
                {scenes.find((scene) => scene.id === link.scene_id)?.name ?? link.scene_id} → Deck {link.preferred_deck_id}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    const logs = await onCoordinateScene(link.scene_id);
                    setCoordinationLog(logs);
                  }}
                  className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => void onRemoveDeckSceneLink(link.id)}
                  className="text-red-300"
                >
                  Del
                </button>
              </div>
            </div>
          ))}
        </div>

        {coordinationLog.length > 0 && (
          <div className="rounded border border-deck-border bg-black/20 p-1.5 space-y-0.5 text-[10px] text-deck-cyan">
            {coordinationLog.map((line, index) => (
              <p key={`${index}-${line}`}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
