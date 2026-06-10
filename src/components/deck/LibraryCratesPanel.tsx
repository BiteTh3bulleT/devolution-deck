import { useMemo, useState } from "react";
import type { Crate, LibraryItem, MediaAsset } from "../../types";

interface LibraryCratesPanelProps {
  media: MediaAsset[];
  libraryItems: LibraryItem[];
  crates: Crate[];
  selectedCrateId: string | null;
  onSelectCrate: (crateId: string | null) => void;
  onCreateCrate: (name: string) => Promise<void>;
  onRemoveCrate: (crateId: string) => Promise<void>;
  onAnalyzeAsset: (mediaAssetId: string) => Promise<void>;
  onAnalyzeAllAssets: () => Promise<void>;
  onLoadDeckTrack: (deckId: string, libraryItemId: string) => Promise<void>;
  onAddToCrate: (crateId: string, itemId: string) => Promise<void>;
  onRemoveFromCrate: (crateId: string, itemId: string) => Promise<void>;
}

function keyText(item: LibraryItem): string {
  const key = item.key_analysis;
  if (!key) return "--";
  return key.camelot ? `${key.key}/${key.camelot}` : key.key;
}

export function LibraryCratesPanel({
  media,
  libraryItems,
  crates,
  selectedCrateId,
  onSelectCrate,
  onCreateCrate,
  onRemoveCrate,
  onAnalyzeAsset,
  onAnalyzeAllAssets,
  onLoadDeckTrack,
  onAddToCrate,
  onRemoveFromCrate,
}: LibraryCratesPanelProps) {
  const [query, setQuery] = useState("");
  const [newCrateName, setNewCrateName] = useState("Main Room");
  const [busy, setBusy] = useState<string | null>(null);

  const mediaById = useMemo(() => new Map(media.map((asset) => [asset.id, asset])), [media]);
  const selectedCrate = crates.find((entry) => entry.id === selectedCrateId) ?? null;

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = [...libraryItems];
    if (selectedCrate) {
      const ids = new Set(selectedCrate.item_ids);
      items = items.filter((item) => ids.has(item.id));
    }
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.title} ${item.artist} ${item.genre ?? ""} ${item.comment ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [libraryItems, query, selectedCrate]);

  const analyzedMediaIds = new Set(libraryItems.map((item) => item.media_asset_id));
  const pendingAssets = media.filter((asset) => !analyzedMediaIds.has(asset.id));

  return (
    <section className="rounded border border-deck-border bg-deck-panel/90 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-widest text-deck-cyan">Library & Crates</h3>
        <button
          type="button"
          onClick={async () => {
            setBusy("analyze_all");
            try {
              await onAnalyzeAllAssets();
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null}
          className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan text-[10px] disabled:opacity-50"
        >
          Analyze New
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
        <input
          value={newCrateName}
          onChange={(event) => setNewCrateName(event.target.value)}
          placeholder="crate name"
          className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          onClick={() => void onCreateCrate(newCrateName)}
          className="px-2 py-1 rounded border border-deck-border text-[11px]"
        >
          + Crate
        </button>
        <button
          type="button"
          disabled={!selectedCrateId}
          onClick={() => void (selectedCrateId ? onRemoveCrate(selectedCrateId) : Promise.resolve())}
          className="px-2 py-1 rounded border border-red-400/30 text-red-300 text-[11px] disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onSelectCrate(null)}
          className={[
            "px-2 py-1 rounded border text-[10px]",
            selectedCrateId == null
              ? "bg-deck-cyan/15 border-deck-cyan/40 text-deck-cyan"
              : "border-deck-border text-deck-text-muted",
          ].join(" ")}
        >
          All Tracks
        </button>
        {crates.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelectCrate(entry.id)}
            className={[
              "px-2 py-1 rounded border text-[10px]",
              selectedCrateId === entry.id
                ? "bg-deck-magenta/15 border-deck-magenta/40 text-deck-magenta"
                : "border-deck-border text-deck-text-muted",
            ].join(" ")}
          >
            {entry.name} ({entry.item_ids.length})
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search title, artist, notes..."
        className="w-full rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
      />

      <div className="max-h-72 overflow-auto space-y-1">
        {filteredItems.map((item) => {
          const mediaAsset = mediaById.get(item.media_asset_id);
          const inCrate = selectedCrate ? selectedCrate.item_ids.includes(item.id) : false;

          return (
            <div key={item.id} className="rounded border border-deck-border bg-deck-surface p-2 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-deck-text truncate">{item.title}</p>
                  <p className="text-deck-text-muted truncate">{item.artist}</p>
                </div>
                <div className="text-right tabular-nums text-deck-text-muted">
                  <p>{item.bpm?.toFixed(1) ?? "--"} BPM</p>
                  <p>{keyText(item)}</p>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => void onLoadDeckTrack("A", item.id)}
                  className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                >
                  Load A
                </button>
                <button
                  type="button"
                  onClick={() => void onLoadDeckTrack("B", item.id)}
                  className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta"
                >
                  Load B
                </button>
                {selectedCrate && (
                  <button
                    type="button"
                    onClick={() =>
                      void (inCrate
                        ? onRemoveFromCrate(selectedCrate.id, item.id)
                        : onAddToCrate(selectedCrate.id, item.id))
                    }
                    className="px-1.5 py-0.5 rounded border border-deck-border text-deck-text-muted"
                  >
                    {inCrate ? "Remove from Crate" : "Add to Crate"}
                  </button>
                )}
                {mediaAsset && (
                  <span className="px-1.5 py-0.5 rounded border border-deck-border text-deck-text-muted/70">
                    {mediaAsset.name}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <p className="text-[11px] text-deck-text-muted">No library tracks for current filter.</p>
        )}
      </div>

      {pendingAssets.length > 0 && (
        <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Unanalyzed Imports</p>
          <div className="max-h-24 overflow-auto space-y-1">
            {pendingAssets.map((asset) => (
              <div key={asset.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-deck-text-muted">{asset.name}</span>
                <button
                  type="button"
                  onClick={() => void onAnalyzeAsset(asset.id)}
                  className="px-1.5 py-0.5 rounded border border-deck-border"
                >
                  Analyze
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
