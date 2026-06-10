import { useMemo, useState } from "react";
import type { DeckState, LibraryItem, Setlist } from "../../types";
import { v4 } from "../../utils/uuid";

interface SetlistPanelProps {
  setlists: Setlist[];
  activeSetlistId?: string;
  selectedSetlistId: string | null;
  libraryItems: LibraryItem[];
  decks: DeckState[];
  onSelectSetlist: (setlistId: string | null) => void;
  onUpsertSetlist: (setlist: Setlist) => Promise<void>;
  onRemoveSetlist: (setlistId: string) => Promise<void>;
  onSetActiveSetlist: (setlistId?: string) => Promise<void>;
  onMarkPlayed: (setlistId: string, entryId: string, played: boolean) => Promise<void>;
  onLoadDeckTrack: (deckId: string, libraryItemId: string) => Promise<void>;
}

export function SetlistPanel({
  setlists,
  activeSetlistId,
  selectedSetlistId,
  libraryItems,
  decks,
  onSelectSetlist,
  onUpsertSetlist,
  onRemoveSetlist,
  onSetActiveSetlist,
  onMarkPlayed,
  onLoadDeckTrack,
}: SetlistPanelProps) {
  const [newSetlistName, setNewSetlistName] = useState("Tonight Main Set");
  const [entryLibraryItemId, setEntryLibraryItemId] = useState(libraryItems[0]?.id ?? "");
  const [entryDeckId, setEntryDeckId] = useState("A");

  const selected =
    setlists.find((entry) => entry.id === selectedSetlistId) ??
    setlists.find((entry) => entry.id === activeSetlistId) ??
    setlists[0];

  const libraryById = useMemo(() => new Map(libraryItems.map((item) => [item.id, item])), [libraryItems]);

  return (
    <section className="rounded border border-deck-border bg-deck-panel/90 p-3 space-y-3">
      <h3 className="text-[11px] uppercase tracking-widest text-deck-cyan">Setlist Preparation</h3>

      <div className="grid grid-cols-[1fr_auto] gap-1">
        <input
          value={newSetlistName}
          onChange={(event) => setNewSetlistName(event.target.value)}
          className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          placeholder="Setlist name"
        />
        <button
          type="button"
          onClick={() =>
            void onUpsertSetlist({
              id: v4(),
              name: newSetlistName.trim() || "Setlist",
              date_label: new Date().toISOString().slice(0, 10),
              venue: undefined,
              notes: undefined,
              entries: [],
              active_entry_id: undefined,
            })
          }
          className="px-2 py-1 rounded border border-deck-border text-[11px]"
        >
          + Setlist
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {setlists.map((setlist) => {
          const active = setlist.id === (selectedSetlistId ?? selected?.id);
          return (
            <button
              key={setlist.id}
              type="button"
              onClick={() => onSelectSetlist(setlist.id)}
              className={[
                "px-2 py-1 rounded border text-[10px]",
                active
                  ? "bg-deck-magenta/15 border-deck-magenta/40 text-deck-magenta"
                  : "border-deck-border text-deck-text-muted",
              ].join(" ")}
            >
              {setlist.name}
            </button>
          );
        })}
      </div>

      {!selected ? (
        <p className="text-[11px] text-deck-text-muted">Create a setlist to prepare transitions.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_70px_auto_auto_auto] gap-1 items-center text-[11px]">
            <select
              value={entryLibraryItemId}
              onChange={(event) => setEntryLibraryItemId(event.target.value)}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              {libraryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.artist} - {item.title}
                </option>
              ))}
            </select>
            <select
              value={entryDeckId}
              onChange={(event) => setEntryDeckId(event.target.value)}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                void onUpsertSetlist({
                  ...selected,
                  entries: [
                    ...selected.entries,
                    {
                      id: v4(),
                      library_item_id: entryLibraryItemId,
                      target_deck_id: entryDeckId,
                      played: false,
                    },
                  ],
                })
              }
              className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan"
            >
              + Entry
            </button>
            <button
              type="button"
              onClick={() => void onSetActiveSetlist(selected.id)}
              className="px-2 py-1 rounded border border-deck-border"
            >
              Set Active
            </button>
            <button
              type="button"
              onClick={() => void onRemoveSetlist(selected.id)}
              className="px-2 py-1 rounded border border-red-400/30 text-red-300"
            >
              Delete
            </button>
          </div>

          <div className="space-y-1 max-h-56 overflow-auto">
            {selected.entries.map((entry, idx) => {
              const item = libraryById.get(entry.library_item_id);
              return (
                <div key={entry.id} className="rounded border border-deck-border bg-deck-surface p-2 text-[10px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-deck-text truncate">
                      {idx + 1}. {item ? `${item.artist} - ${item.title}` : entry.library_item_id}
                    </span>
                    <span className="text-deck-text-muted">Deck {entry.target_deck_id}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onLoadDeckTrack(entry.target_deck_id, entry.library_item_id)}
                      className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => void onMarkPlayed(selected.id, entry.id, !entry.played)}
                      className={[
                        "px-1.5 py-0.5 rounded border",
                        entry.played
                          ? "border-deck-amber/50 text-deck-amber"
                          : "border-deck-border text-deck-text-muted",
                      ].join(" ")}
                    >
                      {entry.played ? "Played" : "Mark Played"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void onUpsertSetlist({
                          ...selected,
                          entries: selected.entries.filter((candidate) => candidate.id !== entry.id),
                        })
                      }
                      className="text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
            {selected.entries.length === 0 && (
              <p className="text-[11px] text-deck-text-muted">No entries yet.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
