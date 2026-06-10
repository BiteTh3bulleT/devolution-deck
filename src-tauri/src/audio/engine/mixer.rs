pub fn track_should_render(muted: bool, solo: bool, any_solo: bool) -> bool {
    if muted {
        return false;
    }
    !any_solo || solo
}

#[cfg(test)]
mod tests {
    #[test]
    fn solo_mode_renders_only_unmuted_soloed_tracks() {
        assert!(super::track_should_render(false, true, true));
        assert!(!super::track_should_render(false, false, true));
        assert!(!super::track_should_render(true, true, true));
    }

    #[test]
    fn normal_mode_renders_unmuted_tracks() {
        assert!(super::track_should_render(false, false, false));
        assert!(!super::track_should_render(true, false, false));
    }
}
