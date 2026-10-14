//! Apply only changes made against a client snapshot, preserving unrelated edits.
use serde_json::Value;

pub fn merge(current: &mut Value, base: &Value, desired: &Value) {
    if base == desired {
        return;
    }
    match (current, base, desired) {
        (Value::Object(current), Value::Object(base), Value::Object(desired)) => {
            for key in base.keys().filter(|key| !desired.contains_key(*key)) {
                current.remove(key);
            }
            for (key, next) in desired {
                if let Some(previous) = base.get(key) {
                    merge(
                        current.entry(key.clone()).or_insert(Value::Null),
                        previous,
                        next,
                    );
                } else {
                    current.insert(key.clone(), next.clone());
                }
            }
        }
        (Value::Array(current), Value::Array(base), Value::Array(desired))
            if identified(base) && identified(desired) && identified(current) =>
        {
            current.retain(|entry| {
                !base.iter().any(|old| old["id"] == entry["id"])
                    || desired.iter().any(|next| next["id"] == entry["id"])
            });
            for next in desired {
                let previous = base.iter().find(|old| old["id"] == next["id"]);
                match current.iter_mut().find(|entry| entry["id"] == next["id"]) {
                    Some(entry) => {
                        if let Some(old) = previous {
                            merge(entry, old, next);
                        } else {
                            *entry = next.clone();
                        }
                    }
                    None if previous.is_none() => current.push(next.clone()),
                    // A concurrently removed object must not be resurrected by a stale edit.
                    None => {}
                }
            }
            let old_ids: Vec<_> = base.iter().map(|v| &v["id"]).collect();
            let next_ids: Vec<_> = desired.iter().map(|v| &v["id"]).collect();
            if old_ids != next_ids {
                current.sort_by_key(|v| {
                    next_ids
                        .iter()
                        .position(|id| **id == v["id"])
                        .unwrap_or(usize::MAX)
                });
            }
        }
        (current, _, desired) => *current = desired.clone(),
    }
}
fn identified(values: &[Value]) -> bool {
    values
        .iter()
        .all(|v| v.get("id").and_then(Value::as_str).is_some())
}
pub fn apply(
    current: &crate::models::Project,
    base: &crate::models::Project,
    desired: &crate::models::Project,
) -> Result<crate::models::Project, String> {
    if current.id != base.id || current.id != desired.id {
        return Err("Project changed while this edit was pending; reload and retry".into());
    }
    let mut value = serde_json::to_value(current).map_err(|e| e.to_string())?;
    merge(
        &mut value,
        &serde_json::to_value(base).map_err(|e| e.to_string())?,
        &serde_json::to_value(desired).map_err(|e| e.to_string())?,
    );
    let result = serde_json::from_value(value).map_err(|e| e.to_string())?;
    crate::project_io::validate_project(&result)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn edits_to_different_track_fields_survive() {
        let base = json!({"tracks":[{"id":"a","volume":0,"pan":0},{"id":"b","volume":0,"pan":0}]});
        let mut current = base.clone();
        let mut volume = base.clone();
        volume["tracks"][0]["volume"] = json!(-12);
        let mut pan = base.clone();
        pan["tracks"][1]["pan"] = json!(0.5);
        merge(&mut current, &base, &volume);
        merge(&mut current, &base, &pan);
        assert_eq!(current["tracks"][0]["volume"], json!(-12));
        assert_eq!(current["tracks"][1]["pan"], json!(0.5));
    }
    #[test]
    fn stale_snapshot_does_not_remove_new_clip() {
        let base = json!({"clips":[{"id":"old","start":0}]});
        let mut current = json!({"clips":[{"id":"old","start":0},{"id":"recording","start":2}]});
        merge(
            &mut current,
            &base,
            &json!({"clips":[{"id":"old","start":1}]}),
        );
        assert_eq!(current["clips"].as_array().unwrap().len(), 2);
        assert_eq!(current["clips"][0]["start"], json!(1));
    }
}
