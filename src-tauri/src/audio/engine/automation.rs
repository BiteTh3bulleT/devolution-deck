//! Automation lane evaluation shared by live playback and export.
//! Semantics intentionally mirror `src/services/automationEngine.ts` so the
//! editor's preview math and the audible engine math agree.

use crate::models::AutomationLane;

fn curved_lerp(t: f64, curve: f64) -> f64 {
    let c = curve.clamp(-1.0, 1.0);
    if c.abs() < 0.001 {
        return t;
    }
    if c > 0.0 {
        // Ease-out style.
        let k = 1.0 + c * 3.0;
        1.0 - (1.0 - t).powf(k)
    } else {
        // Ease-in style.
        let k = 1.0 + c.abs() * 3.0;
        t.powf(k)
    }
}

fn interpolate(left: &crate::models::AutomationPoint, right: &crate::models::AutomationPoint, time_secs: f64) -> f64 {
    let dt = right.time_secs - left.time_secs;
    if dt <= 0.0 {
        return right.value;
    }
    let t = ((time_secs - left.time_secs) / dt).clamp(0.0, 1.0);
    let shaped = curved_lerp(t, left.curve);
    left.value + (right.value - left.value) * shaped
}

/// Single-point evaluation; rendering uses `LaneSampler`. Kept public for
/// commands that need a one-off value and for the semantics tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn evaluate_lane(lane: &AutomationLane, time_secs: f64, fallback: f64) -> f64 {
    if !lane.enabled || lane.points.is_empty() {
        return fallback;
    }
    let mut points: Vec<&crate::models::AutomationPoint> = lane.points.iter().collect();
    points.sort_by(|a, b| a.time_secs.total_cmp(&b.time_secs));
    if time_secs <= points[0].time_secs {
        return points[0].value;
    }
    let last = points[points.len() - 1];
    if time_secs >= last.time_secs {
        return last.value;
    }
    for pair in points.windows(2) {
        if time_secs >= pair[0].time_secs && time_secs <= pair[1].time_secs {
            return interpolate(pair[0], pair[1], time_secs);
        }
    }
    fallback
}

/// Sequential sampler for rendering: pre-sorts points once and advances a
/// cursor as time increases, so per-frame evaluation is O(1) amortized.
pub struct LaneSampler {
    points: Vec<crate::models::AutomationPoint>,
    cursor: usize,
}

impl LaneSampler {
    /// Returns `None` when the lane is disabled or empty (caller should use
    /// the static parameter value).
    pub fn new(lane: &AutomationLane) -> Option<Self> {
        if !lane.enabled || lane.points.is_empty() {
            return None;
        }
        let mut points = lane.points.clone();
        points.sort_by(|a, b| a.time_secs.total_cmp(&b.time_secs));
        Some(Self { points, cursor: 0 })
    }

    /// Value at `time_secs`, assuming non-decreasing time across calls.
    pub fn value_at(&mut self, time_secs: f64) -> f64 {
        if time_secs <= self.points[0].time_secs {
            return self.points[0].value;
        }
        let last = &self.points[self.points.len() - 1];
        if time_secs >= last.time_secs {
            return last.value;
        }
        while self.cursor + 1 < self.points.len()
            && self.points[self.cursor + 1].time_secs < time_secs
        {
            self.cursor += 1;
        }
        interpolate(
            &self.points[self.cursor],
            &self.points[self.cursor + 1],
            time_secs,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::evaluate_lane;
    use crate::models::{AutomationLane, AutomationPoint};

    fn point(time_secs: f64, value: f64, curve: f64) -> AutomationPoint {
        AutomationPoint {
            id: format!("p{time_secs}"),
            time_secs,
            value,
            curve,
        }
    }

    fn lane(points: Vec<AutomationPoint>, enabled: bool) -> AutomationLane {
        AutomationLane {
            id: "lane".to_string(),
            track_id: "track".to_string(),
            parameter: "volume_db".to_string(),
            enabled,
            points,
        }
    }

    #[test]
    fn returns_fallback_for_disabled_or_empty_lane() {
        assert_eq!(evaluate_lane(&lane(vec![], true), 1.0, -3.0), -3.0);
        assert_eq!(
            evaluate_lane(&lane(vec![point(0.0, 6.0, 0.0)], false), 1.0, -3.0),
            -3.0
        );
    }

    #[test]
    fn clamps_to_first_and_last_point_values() {
        let l = lane(vec![point(1.0, 0.0, 0.0), point(3.0, -12.0, 0.0)], true);
        assert_eq!(evaluate_lane(&l, 0.0, 5.0), 0.0);
        assert_eq!(evaluate_lane(&l, 10.0, 5.0), -12.0);
    }

    #[test]
    fn interpolates_linearly_between_points() {
        let l = lane(vec![point(0.0, 0.0, 0.0), point(4.0, -8.0, 0.0)], true);
        assert!((evaluate_lane(&l, 2.0, 0.0) + 4.0).abs() < 1e-9);
        assert!((evaluate_lane(&l, 1.0, 0.0) + 2.0).abs() < 1e-9);
    }

    #[test]
    fn positive_curve_eases_out_matching_frontend_law() {
        // curve=1.0 → k=4, shaped = 1 - (1-t)^4; at t=0.5 → 0.9375.
        let l = lane(vec![point(0.0, 0.0, 1.0), point(1.0, 1.0, 0.0)], true);
        assert!((evaluate_lane(&l, 0.5, 0.0) - 0.9375).abs() < 1e-9);
    }
}
