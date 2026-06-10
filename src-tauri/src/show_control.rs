//! Show-control bridge foundation (MIDI/OSC/DMX dispatch abstraction).
//! Hardware output is not executed yet; this module standardizes payload mapping.

use crate::models::{
    DmxBridgeConfig, DmxUniverseState, LightingCue, MidiBinding, OscBinding,
    PerformanceDashboardState, ShowCue, ShowTrigger, SyncEvent, VisualCue, VisualSyncState,
};
use midir::MidiOutput;
use std::net::UdpSocket;
use std::time::Duration;
use uuid::Uuid;

pub fn cue_preview_payload(cue: &ShowCue) -> String {
    match cue.protocol.to_ascii_lowercase().as_str() {
        "midi" => format!(
            "MIDI OUT -> note/address={} value={:.3} dur={}ms",
            cue.address, cue.value, cue.duration_ms
        ),
        "dmx" => format!(
            "DMX OUT -> channel/address={} value={:.3} dur={}ms",
            cue.address, cue.value, cue.duration_ms
        ),
        _ => format!(
            "OSC OUT -> {} value={:.3} dur={}ms",
            cue.address, cue.value, cue.duration_ms
        ),
    }
}

pub fn visual_sync_tick(sync: &mut VisualSyncState, now_unix_ms: i64) {
    sync.last_event_unix_ms = Some(now_unix_ms);
}

pub fn push_dashboard_event(
    dashboard: &mut PerformanceDashboardState,
    source: &str,
    event: &str,
    payload: &str,
    now_unix_ms: i64,
) {
    dashboard.recent_events.push(SyncEvent {
        id: Uuid::new_v4().to_string(),
        source: source.to_string(),
        event: event.to_string(),
        payload: payload.to_string(),
        unix_ms: now_unix_ms,
    });
    if dashboard.recent_events.len() > 64 {
        let keep_from = dashboard.recent_events.len().saturating_sub(64);
        dashboard.recent_events = dashboard.recent_events.split_off(keep_from);
    }
    dashboard.last_sync_unix_ms = Some(now_unix_ms);
}

fn osc_pad(mut bytes: Vec<u8>) -> Vec<u8> {
    while bytes.len() % 4 != 0 {
        bytes.push(0);
    }
    bytes
}

fn osc_string(value: &str) -> Vec<u8> {
    let mut bytes = value.as_bytes().to_vec();
    bytes.push(0);
    osc_pad(bytes)
}

fn osc_message_bytes(address: &str, argument_type: &str, value: f64) -> Result<Vec<u8>, String> {
    if !address.starts_with('/') {
        return Err("OSC address must start with '/'".to_string());
    }

    let arg_type = argument_type.to_ascii_lowercase();
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&osc_string(address));

    let type_tag = if arg_type.contains("int") || arg_type == "i" {
        ",i"
    } else if arg_type.contains("bool") {
        if value >= 0.5 {
            ",T"
        } else {
            ",F"
        }
    } else {
        ",f"
    };
    bytes.extend_from_slice(&osc_string(type_tag));

    if type_tag == ",i" {
        bytes.extend_from_slice(&(value.round() as i32).to_be_bytes());
    } else if type_tag == ",f" {
        bytes.extend_from_slice(&(value as f32).to_be_bytes());
    }

    Ok(bytes)
}

fn send_osc(binding: &OscBinding, value: f64) -> Result<usize, String> {
    let payload = osc_message_bytes(
        binding.address.as_str(),
        binding.argument_type.as_str(),
        value,
    )?;
    let target = format!("{}:{}", binding.host, binding.port);
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("OSC bind failed: {e}"))?;
    let _ = socket.set_write_timeout(Some(Duration::from_millis(100)));
    socket
        .send_to(&payload, &target)
        .map_err(|e| format!("OSC send failed: {e}"))
}

pub fn send_visual_cue(cue: &VisualCue) -> Result<String, String> {
    if !cue.enabled {
        return Err("Visual cue is disabled".to_string());
    }
    let binding = OscBinding {
        address: cue.address.clone(),
        host: cue.host.clone(),
        port: cue.port,
        argument_type: "f32".to_string(),
    };
    let value = cue.payload.parse::<f64>().unwrap_or(1.0);
    let sent = send_osc(&binding, value)?;
    Ok(format!(
        "Visual cue sent {} bytes to {}:{} {} value={:.3}",
        sent, cue.host, cue.port, cue.address, value
    ))
}

fn midi_status_byte(status: &str, channel: u8) -> u8 {
    let base = match status.to_ascii_lowercase().as_str() {
        "note_off" => 0x80,
        "cc" | "control_change" => 0xB0,
        "program_change" => 0xC0,
        "pitch_bend" => 0xE0,
        _ => 0x90,
    };
    base | (channel.saturating_sub(1) & 0x0F)
}

fn midi_message_bytes(binding: &MidiBinding, trigger_value: f64) -> Vec<u8> {
    let status = midi_status_byte(binding.status.as_str(), binding.channel.max(1));
    let value = (trigger_value.clamp(0.0, 1.0) * 127.0).round() as u8;
    let data2 = if binding.data2 == 0 {
        value
    } else {
        binding.data2
    };

    if status & 0xF0 == 0xC0 {
        vec![status, binding.data1]
    } else {
        vec![status, binding.data1, data2]
    }
}

fn try_send_midi(binding: &MidiBinding, bytes: &[u8]) -> Result<String, String> {
    let midi_out =
        MidiOutput::new("devolution-deck").map_err(|e| format!("MIDI init failed: {e}"))?;
    let ports = midi_out.ports();
    if ports.is_empty() {
        return Err("No MIDI output ports available".to_string());
    }

    let selected_port = if let Some(name_hint) = binding.device_name.as_ref() {
        ports
            .iter()
            .find(|port| {
                midi_out
                    .port_name(port)
                    .map(|name| {
                        name.to_ascii_lowercase()
                            .contains(&name_hint.to_ascii_lowercase())
                    })
                    .unwrap_or(false)
            })
            .cloned()
            .unwrap_or_else(|| ports[0].clone())
    } else {
        ports[0].clone()
    };

    let port_name = midi_out
        .port_name(&selected_port)
        .unwrap_or_else(|_| "unknown".to_string());
    let mut conn = midi_out
        .connect(&selected_port, "devolution-midi-out")
        .map_err(|e| format!("MIDI connect failed: {e}"))?;
    conn.send(bytes)
        .map_err(|e| format!("MIDI send failed: {e}"))?;
    Ok(format!("MIDI sent to {port_name} bytes={:02X?}", bytes))
}

pub fn execute_show_trigger(trigger: &ShowTrigger) -> Result<String, String> {
    if let Some(osc) = &trigger.osc_binding {
        let sent_bytes = send_osc(osc, trigger.value)?;
        return Ok(format!(
            "OSC sent {} bytes to {}:{} {} value={:.3}",
            sent_bytes, osc.host, osc.port, osc.address, trigger.value
        ));
    }

    if let Some(midi) = &trigger.midi_binding {
        let bytes = midi_message_bytes(midi, trigger.value);
        return try_send_midi(midi, &bytes);
    }

    Err("Trigger has no OSC or MIDI binding".to_string())
}

fn ensure_universe_mut<'a>(
    universes: &'a mut Vec<DmxUniverseState>,
    universe: u16,
) -> &'a mut DmxUniverseState {
    if let Some(idx) = universes
        .iter()
        .position(|entry| entry.universe == universe)
    {
        return &mut universes[idx];
    }
    universes.push(DmxUniverseState::new(universe));
    let idx = universes.len().saturating_sub(1);
    &mut universes[idx]
}

fn artnet_dmx_packet(universe: u16, channels: &[u8]) -> Vec<u8> {
    let data_len = channels.len().min(512);
    let padded_len = data_len.max(2);
    let mut packet = Vec::with_capacity(18 + padded_len);
    packet.extend_from_slice(b"Art-Net\0");
    packet.extend_from_slice(&[0x00, 0x50]); // OpCode ArtDMX (little-endian)
    packet.extend_from_slice(&[0x00, 0x0e]); // Protocol version 14
    packet.push(0x00); // Sequence
    packet.push(0x00); // Physical
    packet.push((universe & 0x00FF) as u8);
    packet.push(((universe & 0xFF00) >> 8) as u8);
    packet.push(((padded_len as u16 & 0xFF00) >> 8) as u8);
    packet.push((padded_len as u16 & 0x00FF) as u8);
    packet.extend_from_slice(&channels[..data_len]);
    for _ in data_len..padded_len {
        packet.push(0);
    }
    packet
}

fn send_artnet(host: &str, port: u16, universe: u16, channels: &[u8]) -> Result<usize, String> {
    let packet = artnet_dmx_packet(universe, channels);
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("Art-Net bind failed: {e}"))?;
    let _ = socket.set_write_timeout(Some(Duration::from_millis(100)));
    socket
        .send_to(&packet, format!("{host}:{port}"))
        .map_err(|e| format!("Art-Net send failed: {e}"))
}

pub fn flush_dmx_universes(
    bridge: &DmxBridgeConfig,
    universes: &[DmxUniverseState],
) -> Result<Vec<String>, String> {
    if !bridge.enabled {
        return Ok(vec!["DMX bridge disabled, flush skipped".to_string()]);
    }
    if !bridge.protocol.eq_ignore_ascii_case("artnet") {
        return Err(format!("Unsupported DMX protocol: {}", bridge.protocol));
    }

    let mut out = Vec::new();
    for universe_state in universes {
        let sent = send_artnet(
            bridge.host.as_str(),
            bridge.port,
            universe_state.universe,
            universe_state.channels.as_slice(),
        )?;
        out.push(format!(
            "Art-Net flush sent {} bytes universe={} host={}:{}",
            sent, universe_state.universe, bridge.host, bridge.port
        ));
    }
    Ok(out)
}

pub fn apply_blackout(universes: &mut Vec<DmxUniverseState>, enabled: bool, now_unix_ms: i64) {
    for state in universes {
        state.blackout = enabled;
        if enabled {
            for channel in &mut state.channels {
                *channel = 0;
            }
        }
        state.last_update_unix_ms = Some(now_unix_ms);
    }
}

pub fn execute_lighting_cue(
    bridge: &DmxBridgeConfig,
    universes: &mut Vec<DmxUniverseState>,
    cue: &LightingCue,
    now_unix_ms: i64,
) -> Result<String, String> {
    if !cue.enabled {
        return Err("Lighting cue is disabled".to_string());
    }
    let state = ensure_universe_mut(universes, cue.universe);
    if state.channels.len() < 512 {
        state.channels.resize(512, 0);
    }
    for assignment in &cue.values {
        if assignment.channel == 0 || assignment.channel > 512 {
            continue;
        }
        state.channels[(assignment.channel - 1) as usize] = assignment.value;
    }
    state.blackout = false;
    state.last_update_unix_ms = Some(now_unix_ms);

    if !bridge.enabled {
        return Ok(format!(
            "DMX state updated (bridge disabled): cue={} universe={} values={}",
            cue.name,
            cue.universe,
            cue.values.len()
        ));
    }
    if !bridge.protocol.eq_ignore_ascii_case("artnet") {
        return Err(format!("Unsupported DMX protocol: {}", bridge.protocol));
    }
    let sent = send_artnet(
        bridge.host.as_str(),
        bridge.port,
        cue.universe,
        state.channels.as_slice(),
    )?;
    Ok(format!(
        "Art-Net sent {} bytes for cue={} universe={} host={}:{}",
        sent, cue.name, cue.universe, bridge.host, bridge.port
    ))
}
