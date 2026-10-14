use crate::models::Track;
/// Cut only the selected interval, preserving material on both sides.
pub fn remove_range(track: &mut Track, start: f64, end: f64, bpm: f64) {
    let mut clips = Vec::new();
    for clip in &track.clips {
        let clip_end = clip.start_secs + clip.duration_secs;
        if clip_end <= start || clip.start_secs >= end {
            clips.push(clip.clone());
            continue;
        }
        let speed = clip
            .warp
            .as_ref()
            .filter(|w| w.enabled)
            .map(|w| w.target_bpm.unwrap_or(bpm) / w.source_bpm.unwrap_or(bpm))
            .unwrap_or(1.0);
        if clip.start_secs < start {
            let mut left = clip.clone();
            left.duration_secs = start - clip.start_secs;
            clips.push(left);
        }
        if clip_end > end {
            let mut right = clip.clone();
            right.id = uuid::Uuid::new_v4().to_string();
            right.start_secs = end;
            right.source_offset_secs += (end - clip.start_secs) * speed;
            right.duration_secs = clip_end - end;
            clips.push(right);
        }
    }
    track.clips = clips;
    let ticks_per_sec = bpm / 60.0 * crate::models::TICKS_PER_BEAT as f64;
    let mut midi = Vec::new();
    for clip in &track.midi_clips {
        let clip_end = clip.start_secs + clip.duration_secs;
        if clip_end <= start || clip.start_secs >= end {
            midi.push(clip.clone());
            continue;
        }
        for (a, b) in [
            (clip.start_secs, start.min(clip_end)),
            (end.max(clip.start_secs), clip_end),
        ] {
            if b <= a {
                continue;
            }
            let mut piece = clip.clone();
            piece.id = uuid::Uuid::new_v4().to_string();
            piece.start_secs = a;
            piece.duration_secs = b - a;
            piece.loop_clip = false;
            piece.notes = clip
                .notes
                .iter()
                .filter_map(|note| {
                    let on = clip.start_secs + note.start_ticks as f64 / ticks_per_sec;
                    let off = on + note.duration_ticks as f64 / ticks_per_sec;
                    if off <= a || on >= b {
                        return None;
                    }
                    let mut trimmed = note.clone();
                    trimmed.id = uuid::Uuid::new_v4().to_string();
                    trimmed.start_ticks = ((on.max(a) - a) * ticks_per_sec).round() as u32;
                    trimmed.duration_ticks =
                        ((off.min(b) - on.max(a)) * ticks_per_sec).round().max(1.0) as u32;
                    Some(trimmed)
                })
                .collect();
            midi.push(piece);
        }
    }
    track.midi_clips = midi;
    let mut regions = Vec::new();
    for region in &track.comp_regions {
        if region.end_secs <= start || region.start_secs >= end {
            regions.push(region.clone());
            continue;
        }
        if region.start_secs < start {
            let mut left = region.clone();
            left.end_secs = start;
            regions.push(left);
        }
        if region.end_secs > end {
            let mut right = region.clone();
            right.id = uuid::Uuid::new_v4().to_string();
            right.start_secs = end;
            regions.push(right);
        }
    }
    track.comp_regions = regions;
}
