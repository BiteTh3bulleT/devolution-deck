import { useMemo, useState } from "react";
import { DeckChannelCard } from "./deck/DeckChannelCard";
import { LibraryCratesPanel } from "./deck/LibraryCratesPanel";
import { LiveCoordinationPanel } from "./deck/LiveCoordinationPanel";
import { SamplerPadsPanel } from "./deck/SamplerPadsPanel";
import { SetlistPanel } from "./deck/SetlistPanel";
import { useDjStore } from "../stores/djStore";
import { useProjectStore } from "../stores/projectStore";

async function runWithError(action: () => Promise<unknown>, onError: (message: string) => void): Promise<void> {
  try {
    await action();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

export function DeckPerformanceView() {
  const project = useProjectStore((state) => state.project);

  const selectedCrateId = useDjStore((state) => state.selectedCrateId);
  const selectedSetlistId = useDjStore((state) => state.selectedSetlistId);
  const setSelectedCrateId = useDjStore((state) => state.setSelectedCrateId);
  const setSelectedSetlistId = useDjStore((state) => state.setSelectedSetlistId);

  const analyzeAsset = useDjStore((state) => state.analyzeAsset);
  const analyzeAllAssets = useDjStore((state) => state.analyzeAllAssets);
  const createCrate = useDjStore((state) => state.createCrate);
  const removeCrate = useDjStore((state) => state.removeCrate);
  const addItemToCrate = useDjStore((state) => state.addItemToCrate);
  const removeItemFromCrate = useDjStore((state) => state.removeItemFromCrate);

  const loadDeckTrack = useDjStore((state) => state.loadDeckTrack);
  const setDeckPlaying = useDjStore((state) => state.setDeckPlaying);
  const seekDeck = useDjStore((state) => state.seekDeck);
  const turntableNudge = useDjStore((state) => state.turntableNudge);
  const turntableScratch = useDjStore((state) => state.turntableScratch);
  const configureTurntable = useDjStore((state) => state.configureTurntable);
  const addHotCue = useDjStore((state) => state.addHotCue);
  const triggerHotCue = useDjStore((state) => state.triggerHotCue);
  const removeHotCue = useDjStore((state) => state.removeHotCue);
  const setDeckLoop = useDjStore((state) => state.setDeckLoop);
  const clearDeckLoop = useDjStore((state) => state.clearDeckLoop);

  const updateDeckSync = useDjStore((state) => state.updateDeckSync);
  const applyDeckSync = useDjStore((state) => state.applyDeckSync);
  const setCrossfaderPosition = useDjStore((state) => state.setCrossfaderPosition);
  const setCrossfaderCurve = useDjStore((state) => state.setCrossfaderCurve);
  const bindTrackToCrossfader = useDjStore((state) => state.bindTrackToCrossfader);

  const upsertSamplerSlot = useDjStore((state) => state.upsertSamplerSlot);
  const removeSamplerSlot = useDjStore((state) => state.removeSamplerSlot);
  const upsertPerformancePad = useDjStore((state) => state.upsertPerformancePad);
  const removePerformancePad = useDjStore((state) => state.removePerformancePad);
  const triggerPerformancePad = useDjStore((state) => state.triggerPerformancePad);

  const upsertSetlist = useDjStore((state) => state.upsertSetlist);
  const removeSetlist = useDjStore((state) => state.removeSetlist);
  const setActiveSetlist = useDjStore((state) => state.setActiveSetlist);
  const markSetlistEntryPlayed = useDjStore((state) => state.markSetlistEntryPlayed);

  const upsertShowTrigger = useDjStore((state) => state.upsertShowTrigger);
  const removeShowTrigger = useDjStore((state) => state.removeShowTrigger);
  const executeShowTrigger = useDjStore((state) => state.executeShowTrigger);
  const upsertDeckEventBinding = useDjStore((state) => state.upsertDeckEventBinding);
  const removeDeckEventBinding = useDjStore((state) => state.removeDeckEventBinding);
  const upsertDeckSceneLink = useDjStore((state) => state.upsertDeckSceneLink);
  const removeDeckSceneLink = useDjStore((state) => state.removeDeckSceneLink);
  const coordinateScene = useDjStore((state) => state.coordinateScene);

  const [error, setError] = useState<string | null>(null);

  const runForValue = async <T,>(action: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return fallback;
    }
  };

  const decks = project?.decks ?? [];
  const deckA = decks.find((deck) => deck.id === "A") ?? decks[0];
  const deckB = decks.find((deck) => deck.id === "B") ?? decks[1];

  const libraryById = useMemo(
    () => new Map((project?.library_items ?? []).map((item) => [item.id, item])),
    [project?.library_items]
  );

  const loadedA = deckA?.loaded_track ? libraryById.get(deckA.loaded_track.library_item_id) : undefined;
  const loadedB = deckB?.loaded_track ? libraryById.get(deckB.loaded_track.library_item_id) : undefined;

  if (!project || !deckA || !deckB) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-deck-text-muted">
        No project loaded.
      </div>
    );
  }

  const bindingByTrack = new Map(project.crossfader.track_bindings.map((entry) => [entry.track_id, entry.side]));

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_0%_0%,rgba(56,215,255,0.12),transparent_38%),radial-gradient(circle_at_100%_0%,rgba(255,107,26,0.12),transparent_42%)] p-4">
      <div className="max-w-[1500px] mx-auto space-y-4">
        <section className="rounded border border-deck-border bg-deck-panel/85 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-deck-cyan">Dual Deck Performance Mode</p>
              <p className="text-[11px] text-deck-text-muted">
                Sync {project.deck_sync.enabled ? "ON" : "OFF"} · Master {project.deck_sync.master_deck_id} ·
                Quantize {project.deck_sync.sync_quantize_beats} beats
              </p>
            </div>
            <div className="text-[11px] text-deck-text-muted">
              Library {project.library_items.length} · Crates {project.crates.length} · Setlists {project.setlists.length}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-3 text-[11px]">
            <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
              <p className="uppercase tracking-wide text-deck-text-muted text-[10px]">Beat Sync</p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={project.deck_sync.enabled}
                    onChange={(event) =>
                      void runWithError(
                        () => updateDeckSync({ enabled: event.target.checked }),
                        setError
                      )
                    }
                  />
                  Enabled
                </label>
                <select
                  value={project.deck_sync.master_deck_id}
                  onChange={(event) =>
                    void runWithError(
                      () => updateDeckSync({ master_deck_id: event.target.value }),
                      setError
                    )
                  }
                  className="rounded border border-deck-border bg-deck-panel px-2 py-1"
                >
                  <option value="A">Master A</option>
                  <option value="B">Master B</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void runWithError(
                      () =>
                        applyDeckSync(
                          project.deck_sync.master_deck_id,
                          project.deck_sync.master_deck_id === "A" ? "B" : "A"
                        ),
                      setError
                    )
                  }
                  className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan"
                >
                  Sync Now
                </button>
              </div>
            </div>

            <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
              <p className="uppercase tracking-wide text-deck-text-muted text-[10px]">Crossfader Bridge</p>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={project.crossfader.position}
                onChange={(event) =>
                  void runWithError(() => setCrossfaderPosition(Number(event.target.value)), setError)
                }
              />
              <div className="flex items-center justify-between text-[10px] text-deck-text-muted">
                <span>A Gain {project.crossfader.deck_a_gain.toFixed(2)}</span>
                <span>B Gain {project.crossfader.deck_b_gain.toFixed(2)}</span>
              </div>
              <label className="text-[10px] text-deck-text-muted flex items-center gap-2">
                Curve
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={project.crossfader.curve}
                  onChange={(event) =>
                    void runWithError(() => setCrossfaderCurve(Number(event.target.value)), setError)
                  }
                />
              </label>
            </div>

            <div className="rounded border border-deck-border bg-deck-surface p-2 space-y-1.5">
              <p className="uppercase tracking-wide text-deck-text-muted text-[10px]">Mixer Side Assign</p>
              <div className="max-h-24 overflow-auto space-y-1">
                {project.tracks.map((track) => {
                  const side = bindingByTrack.get(track.id) ?? "center";
                  return (
                    <div key={track.id} className="grid grid-cols-[1fr_90px] gap-1 items-center text-[10px]">
                      <span className="truncate text-deck-text-muted">{track.name}</span>
                      <select
                        value={side}
                        onChange={(event) =>
                          void runWithError(
                            () => bindTrackToCrossfader(track.id, event.target.value as "left" | "center" | "right"),
                            setError
                          )
                        }
                        className="rounded border border-deck-border bg-deck-panel px-1 py-0.5"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 grid lg:grid-cols-4 gap-2 text-[10px]">
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <p className="text-deck-text-muted uppercase tracking-wide">Show Status</p>
              <p className="text-deck-text">
                {project.show_project.safety_state.panic_active
                  ? "PANIC"
                  : project.show_project.safety_state.blackout.enabled
                    ? "BLACKOUT"
                    : "READY"}
              </p>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <p className="text-deck-text-muted uppercase tracking-wide">Active Scene</p>
              <p className="text-deck-text">
                {project.session.scenes.find((scene) => scene.id === project.show_project.dashboard.active_scene_id)?.name ??
                  "None"}
              </p>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <p className="text-deck-text-muted uppercase tracking-wide">Deck/Show Link</p>
              <p className="text-deck-text">
                A: {loadedA?.title ?? "Empty"} · B: {loadedB?.title ?? "Empty"}
              </p>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <p className="text-deck-text-muted uppercase tracking-wide">Reliability</p>
              <p className="text-deck-text">
                Fail {project.show_project.safety_state.fail_count} · Events {project.show_project.dashboard.recent_events.length}
              </p>
            </div>
          </div>
        </section>

        <div className="grid xl:grid-cols-2 gap-4">
          <DeckChannelCard
            deck={deckA}
            loadedItem={loadedA}
            onTogglePlay={(deckId, playing) => runWithError(() => setDeckPlaying(deckId, playing), setError)}
            onSeek={(deckId, positionSecs) => runWithError(() => seekDeck(deckId, positionSecs), setError)}
            onNudge={(deckId, deltaBeats) => runWithError(() => turntableNudge(deckId, deltaBeats), setError)}
            onScratch={(deckId, deltaSecs, friction) =>
              runWithError(() => turntableScratch(deckId, deltaSecs, friction), setError)
            }
            onConfigureTurntable={(deckId, vinylMode, jogSensitivity) =>
              runWithError(() => configureTurntable(deckId, vinylMode, jogSensitivity), setError)
            }
            onSetLoop={(deckId, startSecs, endSecs, quantizeBeats) =>
              runWithError(() => setDeckLoop(deckId, startSecs, endSecs, quantizeBeats), setError)
            }
            onClearLoop={(deckId) => runWithError(() => clearDeckLoop(deckId), setError)}
            onAddHotCue={(deckId, positionSecs) => runWithError(() => addHotCue(deckId, positionSecs), setError)}
            onTriggerCue={(deckId, cueId) => runWithError(() => triggerHotCue(deckId, cueId), setError)}
            onRemoveCue={(deckId, cueId) => runWithError(() => removeHotCue(deckId, cueId), setError)}
          />

          <DeckChannelCard
            deck={deckB}
            loadedItem={loadedB}
            onTogglePlay={(deckId, playing) => runWithError(() => setDeckPlaying(deckId, playing), setError)}
            onSeek={(deckId, positionSecs) => runWithError(() => seekDeck(deckId, positionSecs), setError)}
            onNudge={(deckId, deltaBeats) => runWithError(() => turntableNudge(deckId, deltaBeats), setError)}
            onScratch={(deckId, deltaSecs, friction) =>
              runWithError(() => turntableScratch(deckId, deltaSecs, friction), setError)
            }
            onConfigureTurntable={(deckId, vinylMode, jogSensitivity) =>
              runWithError(() => configureTurntable(deckId, vinylMode, jogSensitivity), setError)
            }
            onSetLoop={(deckId, startSecs, endSecs, quantizeBeats) =>
              runWithError(() => setDeckLoop(deckId, startSecs, endSecs, quantizeBeats), setError)
            }
            onClearLoop={(deckId) => runWithError(() => clearDeckLoop(deckId), setError)}
            onAddHotCue={(deckId, positionSecs) => runWithError(() => addHotCue(deckId, positionSecs), setError)}
            onTriggerCue={(deckId, cueId) => runWithError(() => triggerHotCue(deckId, cueId), setError)}
            onRemoveCue={(deckId, cueId) => runWithError(() => removeHotCue(deckId, cueId), setError)}
          />
        </div>

        <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4">
          <LibraryCratesPanel
            media={project.media}
            libraryItems={project.library_items}
            crates={project.crates}
            selectedCrateId={selectedCrateId}
            onSelectCrate={setSelectedCrateId}
            onCreateCrate={(name) => runWithError(() => createCrate(name), setError)}
            onRemoveCrate={(crateId) => runWithError(() => removeCrate(crateId), setError)}
            onAnalyzeAsset={(mediaAssetId) => runWithError(() => analyzeAsset(mediaAssetId), setError)}
            onAnalyzeAllAssets={() => runWithError(() => analyzeAllAssets(), setError)}
            onLoadDeckTrack={(deckId, libraryItemId) =>
              runWithError(() => loadDeckTrack(deckId, libraryItemId), setError)
            }
            onAddToCrate={(crateId, itemId) => runWithError(() => addItemToCrate(crateId, itemId), setError)}
            onRemoveFromCrate={(crateId, itemId) =>
              runWithError(() => removeItemFromCrate(crateId, itemId), setError)
            }
          />

          <div className="space-y-4">
            <SamplerPadsPanel
              libraryItems={project.library_items}
              scenes={project.session.scenes}
              macros={project.performance_macros}
              showTriggers={project.show_triggers}
              samplerSlots={project.sampler_slots}
              pads={project.performance_pads}
              onUpsertSamplerSlot={(slot) => runWithError(() => upsertSamplerSlot(slot), setError)}
              onRemoveSamplerSlot={(slotId) => runWithError(() => removeSamplerSlot(slotId), setError)}
              onUpsertPad={(pad) => runWithError(() => upsertPerformancePad(pad), setError)}
              onRemovePad={(padId) => runWithError(() => removePerformancePad(padId), setError)}
              onTriggerPad={(padId) => runWithError(() => triggerPerformancePad(padId), setError)}
            />

            <SetlistPanel
              setlists={project.setlists}
              activeSetlistId={project.active_setlist_id}
              selectedSetlistId={selectedSetlistId}
              libraryItems={project.library_items}
              decks={project.decks}
              onSelectSetlist={setSelectedSetlistId}
              onUpsertSetlist={(setlist) => runWithError(() => upsertSetlist(setlist), setError)}
              onRemoveSetlist={(setlistId) => runWithError(() => removeSetlist(setlistId), setError)}
              onSetActiveSetlist={(setlistId) => runWithError(() => setActiveSetlist(setlistId), setError)}
              onMarkPlayed={(setlistId, entryId, played) =>
                runWithError(() => markSetlistEntryPlayed(setlistId, entryId, played), setError)
              }
              onLoadDeckTrack={(deckId, libraryItemId) =>
                runWithError(() => loadDeckTrack(deckId, libraryItemId), setError)
              }
            />

            <LiveCoordinationPanel
              scenes={project.session.scenes}
              libraryItems={project.library_items}
              showTriggers={project.show_triggers}
              deckEventBindings={project.deck_event_bindings}
              deckSceneLinks={project.deck_scene_links}
              onUpsertShowTrigger={(trigger) => runWithError(() => upsertShowTrigger(trigger), setError)}
              onRemoveShowTrigger={(triggerId) => runWithError(() => removeShowTrigger(triggerId), setError)}
              onExecuteShowTrigger={(triggerId) => runForValue(() => executeShowTrigger(triggerId), "Execution failed")}
              onUpsertDeckEventBinding={(binding) =>
                runWithError(() => upsertDeckEventBinding(binding), setError)
              }
              onRemoveDeckEventBinding={(bindingId) =>
                runWithError(() => removeDeckEventBinding(bindingId), setError)
              }
              onUpsertDeckSceneLink={(link) => runWithError(() => upsertDeckSceneLink(link), setError)}
              onRemoveDeckSceneLink={(linkId) => runWithError(() => removeDeckSceneLink(linkId), setError)}
              onCoordinateScene={(sceneId) => runForValue(() => coordinateScene(sceneId), ["Coordination failed"])}
            />
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-400/40 bg-red-900/30 p-2 text-[11px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
