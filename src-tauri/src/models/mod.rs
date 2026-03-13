//! Domain models for DEVOLUTION//DECK.
//! Shared structures used by persistence, audio, and frontend.

mod project;
mod transport;

pub use project::{MediaAsset, Project, TimelineClip, Track, PROJECT_SCHEMA_VERSION};
pub use transport::TransportState;
