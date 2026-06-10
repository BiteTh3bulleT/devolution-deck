import { useMemo, useState } from "react";
import type {
  PerformanceMacro,
  PerformancePad,
  SamplerSlot,
  Scene,
  ShowTrigger,
  LibraryItem,
} from "../../types";
import { v4 } from "../../utils/uuid";

interface SamplerPadsPanelProps {
  libraryItems: LibraryItem[];
  scenes: Scene[];
  macros: PerformanceMacro[];
  showTriggers: ShowTrigger[];
  samplerSlots: SamplerSlot[];
  pads: PerformancePad[];
  onUpsertSamplerSlot: (slot: SamplerSlot) => Promise<void>;
  onRemoveSamplerSlot: (slotId: string) => Promise<void>;
  onUpsertPad: (pad: PerformancePad) => Promise<void>;
  onRemovePad: (padId: string) => Promise<void>;
  onTriggerPad: (padId: string) => Promise<void>;
}

const PAD_COLORS = [
  "#38d7ff",
  "#ff6b1a",
  "#ff4fd8",
  "#ffc247",
  "#7cf29a",
  "#7aa4ff",
  "#ff7a9f",
  "#8ef2ff",
];

export function SamplerPadsPanel({
  libraryItems,
  scenes,
  macros,
  showTriggers,
  samplerSlots,
  pads,
  onUpsertSamplerSlot,
  onRemoveSamplerSlot,
  onUpsertPad,
  onRemovePad,
  onTriggerPad,
}: SamplerPadsPanelProps) {
  const [newSlotName, setNewSlotName] = useState("One Shot");
  const [newSlotLibraryItemId, setNewSlotLibraryItemId] = useState<string>(libraryItems[0]?.id ?? "");

  const slotsById = useMemo(() => new Map(samplerSlots.map((slot) => [slot.id, slot])), [samplerSlots]);

  const padded = useMemo(() => {
    const existing = [...pads].slice(0, 8);
    if (existing.length >= 8) return existing;
    for (let i = existing.length; i < 8; i += 1) {
      existing.push({
        id: `virtual-${i}`,
        name: `Pad ${i + 1}`,
        quantize_beats: 4,
        color: PAD_COLORS[i % PAD_COLORS.length],
        enabled: true,
      });
    }
    return existing;
  }, [pads]);

  return (
    <section className="rounded border border-deck-border bg-deck-panel/90 p-3 space-y-3">
      <h3 className="text-[11px] uppercase tracking-widest text-deck-cyan">Sampler & Performance Pads</h3>

      <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Sampler Slots</p>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
          <input
            value={newSlotName}
            onChange={(event) => setNewSlotName(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1 text-[11px]"
            placeholder="slot name"
          />
          <select
            value={newSlotLibraryItemId}
            onChange={(event) => setNewSlotLibraryItemId(event.target.value)}
            className="rounded border border-deck-border bg-deck-panel px-2 py-1 text-[11px]"
          >
            <option value="">No track</option>
            {libraryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.artist} - {item.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              void onUpsertSamplerSlot({
                id: v4(),
                name: newSlotName.trim() || "Slot",
                library_item_id: newSlotLibraryItemId || undefined,
                gain_db: 0,
                one_shot: true,
              })
            }
            className="px-2 py-1 rounded border border-deck-border text-[11px]"
          >
            + Slot
          </button>
          <button
            type="button"
            onClick={async () => {
              for (let i = 0; i < 8; i += 1) {
                const existing = pads[i];
                if (existing && !existing.id.startsWith("virtual-")) continue;
                await onUpsertPad({
                  id: existing?.id.startsWith("virtual-") ? v4() : existing?.id ?? v4(),
                  name: `Pad ${i + 1}`,
                  sampler_slot_id: samplerSlots[i]?.id,
                  quantize_beats: 4,
                  color: PAD_COLORS[i % PAD_COLORS.length],
                  enabled: true,
                });
              }
            }}
            className="px-2 py-1 rounded border border-deck-magenta/40 text-deck-magenta text-[11px]"
          >
            Seed 8 Pads
          </button>
        </div>

        <div className="space-y-1 max-h-24 overflow-auto text-[10px]">
          {samplerSlots.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between rounded border border-deck-border p-1">
              <span className="truncate text-deck-text-muted">
                {slot.name}
                {slot.library_item_id
                  ? ` · ${libraryItems.find((item) => item.id === slot.library_item_id)?.title ?? "track"}`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => void onRemoveSamplerSlot(slot.id)}
                className="text-red-300"
              >
                Del
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {padded.map((pad, index) => {
          const realPad = !pad.id.startsWith("virtual-") ? pad : undefined;
          const slot = realPad?.sampler_slot_id ? slotsById.get(realPad.sampler_slot_id) : undefined;

          return (
            <div
              key={pad.id}
              className="rounded border p-2 space-y-1"
              style={{ borderColor: `${pad.color}70`, background: `${pad.color}14` }}
            >
              <button
                type="button"
                disabled={!realPad?.enabled}
                onClick={() => void (realPad ? onTriggerPad(realPad.id) : Promise.resolve())}
                className="w-full rounded border border-black/20 bg-black/20 px-2 py-2 text-[11px] text-left disabled:opacity-40"
              >
                <div className="text-deck-text">{pad.name}</div>
                <div className="text-[10px] text-deck-text-muted truncate">{slot?.name ?? "Unassigned"}</div>
              </button>

              <select
                value={realPad?.sampler_slot_id ?? ""}
                onChange={(event) => {
                  const nextSlot = event.target.value || undefined;
                  const base = realPad ?? {
                    id: v4(),
                    name: `Pad ${index + 1}`,
                    quantize_beats: 4,
                    color: PAD_COLORS[index % PAD_COLORS.length],
                    enabled: true,
                  };
                  void onUpsertPad({ ...base, sampler_slot_id: nextSlot });
                }}
                className="w-full rounded border border-deck-border bg-deck-surface px-1 py-1 text-[10px]"
              >
                <option value="">No slot</option>
                {samplerSlots.map((slotEntry) => (
                  <option key={slotEntry.id} value={slotEntry.id}>
                    {slotEntry.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-3 gap-1">
                <select
                  value={realPad?.scene_id ?? ""}
                  onChange={(event) => {
                    if (!realPad) return;
                    void onUpsertPad({
                      ...realPad,
                      scene_id: event.target.value || undefined,
                    });
                  }}
                  className="rounded border border-deck-border bg-deck-surface px-1 py-1 text-[10px]"
                >
                  <option value="">Scene</option>
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </select>

                <select
                  value={realPad?.macro_id ?? ""}
                  onChange={(event) => {
                    if (!realPad) return;
                    void onUpsertPad({
                      ...realPad,
                      macro_id: event.target.value || undefined,
                    });
                  }}
                  className="rounded border border-deck-border bg-deck-surface px-1 py-1 text-[10px]"
                >
                  <option value="">Macro</option>
                  {macros.map((macro) => (
                    <option key={macro.id} value={macro.id}>
                      {macro.name}
                    </option>
                  ))}
                </select>

                <select
                  value={realPad?.show_trigger_id ?? ""}
                  onChange={(event) => {
                    if (!realPad) return;
                    void onUpsertPad({
                      ...realPad,
                      show_trigger_id: event.target.value || undefined,
                    });
                  }}
                  className="rounded border border-deck-border bg-deck-surface px-1 py-1 text-[10px]"
                >
                  <option value="">Show</option>
                  {showTriggers.map((trigger) => (
                    <option key={trigger.id} value={trigger.id}>
                      {trigger.name}
                    </option>
                  ))}
                </select>
              </div>

              {realPad && (
                <button
                  type="button"
                  onClick={() => void onRemovePad(realPad.id)}
                  className="text-[10px] text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
