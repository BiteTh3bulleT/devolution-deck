/**
 * Tauri invoke wrappers for backend commands.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Project, MediaAsset, Track, TimelineClip, WaveformPeaks } from "../types";

export async function projectNew(): Promise<Project> {
  return invoke<Project>("project_new");
}

export async function projectGet(): Promise<Project> {
  return invoke<Project>("project_get");
}

export async function projectSave(path: string): Promise<void> {
  return invoke("project_save", { path });
}

export async function projectOpen(path: string): Promise<Project> {
  return invoke<Project>("project_open", { path });
}

export async function projectUpdate(project: Project): Promise<Project> {
  return invoke<Project>("project_update", { project });
}

export async function mediaImportAudio(path: string): Promise<MediaAsset> {
  return invoke<MediaAsset>("media_import_audio", { path });
}

export async function waveformPeaks(path: string, numBuckets: number): Promise<WaveformPeaks> {
  return invoke<WaveformPeaks>("waveform_peaks", { path, numBuckets });
}

export async function trackAdd(name: string): Promise<Track> {
  return invoke<Track>("track_add", { name });
}

export async function clipPlace(payload: {
  media_asset_id: string;
  track_index: number;
  start_secs: number;
  source_offset_secs: number;
  duration_secs: number;
}): Promise<TimelineClip> {
  return invoke<TimelineClip>("clip_place", { payload });
}

export async function playbackPlay(payload: {
  path: string;
  offset_secs: number;
  duration_secs: number;
}): Promise<void> {
  return invoke("playback_play", { payload });
}

export async function playbackStop(): Promise<void> {
  return invoke("playback_stop");
}

export async function playbackPositionMs(): Promise<number> {
  return invoke<number>("playback_position_ms");
}

export async function playbackIsPlaying(): Promise<boolean> {
  return invoke<boolean>("playback_is_playing");
}
