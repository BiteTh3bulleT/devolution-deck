import { create } from "zustand";
import { DEFAULT_PROCESS } from "../types/audioLab";
import type { AudioAnalysis, ProcessSettings, SignalSettings, LabDevice } from "../types/audioLab";
interface LabState {
  assetId: string | null; analysis: AudioAnalysis | null; resultId: string | null; resultAnalysis: AudioAnalysis | null;
  settings: ProcessSettings; signal: SignalSettings; devices: LabDevice[]; inputDevice: string | null;
  busy: string | null; error: string | null; message: string | null;
  patchSettings: (patch: Partial<ProcessSettings>) => void;
  patchSignal: (patch: Partial<SignalSettings>) => void;
}
export const useAudioLabStore = create<LabState>((set) => ({
  assetId: null, analysis: null, resultId: null, resultAnalysis: null, settings: { ...DEFAULT_PROCESS },
  signal: { kind: "sine", duration_secs: 5, frequency_hz: 440, end_frequency_hz: 20000, level_dbfs: -18, sample_rate: 48000 },
  devices: [], inputDevice: null, busy: null, error: null, message: null,
  patchSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  patchSignal: (patch) => set((s) => ({ signal: { ...s.signal, ...patch } })),
}));
