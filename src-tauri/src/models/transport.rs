//! Transport state (play/stop/position). Ephemeral; not persisted.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransportState {
    Stopped,
    Playing,
}

impl Default for TransportState {
    fn default() -> Self {
        Self::Stopped
    }
}
