//! Deterministic, Git-independent layout for the commit graph.

use crate::domain::{CommitSummary, HistoryPage};
use std::collections::{BTreeMap, HashSet};

pub type Lane = usize;
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LaneState {
    pub open: BTreeMap<String, Lane>,
    pub lane_count: usize,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Connection {
    pub from: Lane,
    pub to: Lane,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitLayout {
    pub commit: CommitSummary,
    pub row: usize,
    pub lane: Lane,
    pub parent_lanes: Vec<Lane>,
    pub connections: Vec<Connection>,
    /// Lanes which cross this row. This includes lanes that pass behind a
    /// merge, so a renderer can keep their lines continuous.
    pub active_lanes: Vec<Lane>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GraphLayout {
    pub rows: Vec<CommitLayout>,
    pub lane_count: usize,
    pub has_more: bool,
}

#[inline]
fn mark_lane(bitset: &mut Vec<bool>, lane: Lane) {
    if lane >= bitset.len() {
        bitset.resize(lane + 1, false);
    }
    bitset[lane] = true;
}

pub fn layout_page(page: &HistoryPage, incoming: &LaneState) -> (GraphLayout, LaneState) {
    let mut state = incoming.clone();
    let mut rows = Vec::with_capacity(page.commits.len());
    let mut seen = HashSet::with_capacity(page.commits.len());
    let mut active_bitset = Vec::<bool>::with_capacity(state.lane_count.max(8));
    let mut used_bitset = Vec::<bool>::with_capacity(state.lane_count.max(8));

    for (row, commit) in page.commits.iter().cloned().enumerate() {
        active_bitset.fill(false);
        for &open_lane in state.open.values() {
            mark_lane(&mut active_bitset, open_lane);
        }

        let lane = state
            .open
            .remove(&commit.oid)
            .unwrap_or_else(|| allocate_lane(&state, &mut used_bitset));
        mark_lane(&mut active_bitset, lane);
        state.lane_count = state.lane_count.max(lane + 1);

        let mut parent_lanes = Vec::with_capacity(commit.parents.len());
        for (index, parent) in commit.parents.iter().enumerate() {
            // A parent may already have a lane opened by an earlier sibling.
            // Reusing it is what makes both sides of a merge meet rather than
            // replacing that lane and breaking the graph on the next row.
            let parent_lane = state.open.get(parent).copied().unwrap_or_else(|| {
                if index == 0 {
                    lane
                } else {
                    allocate_lane(&state, &mut used_bitset)
                }
            });
            state.open.insert(parent.clone(), parent_lane);
            mark_lane(&mut active_bitset, parent_lane);
            state.lane_count = state.lane_count.max(parent_lane + 1);
            parent_lanes.push(parent_lane);
        }

        if seen.insert(commit.oid.clone()) {
            let connections = parent_lanes
                .iter()
                .copied()
                .map(|to| Connection { from: lane, to })
                .collect();
            let active_lanes = active_bitset
                .iter()
                .enumerate()
                .filter_map(|(idx, &active)| active.then_some(idx))
                .collect();
            rows.push(CommitLayout {
                commit,
                row,
                lane,
                parent_lanes,
                connections,
                active_lanes,
            });
        }
    }
    state.lane_count = state
        .lane_count
        .max(state.open.values().copied().max().map_or(0, |n| n + 1));
    (
        GraphLayout {
            rows,
            lane_count: state.lane_count,
            has_more: page.has_more,
        },
        state,
    )
}
pub fn layout_history(page: &HistoryPage) -> GraphLayout {
    layout_page(page, &LaneState::default()).0
}
fn allocate_lane(state: &LaneState, used: &mut Vec<bool>) -> Lane {
    let needed = state.lane_count + 1;
    if used.len() < needed {
        used.resize(needed, false);
    }
    used[..needed].fill(false);
    for &lane in state.open.values() {
        if lane >= used.len() {
            used.resize(lane + 1, false);
        }
        used[lane] = true;
    }
    used.iter()
        .position(|&in_use| !in_use)
        .unwrap_or(used.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn c(oid: &str, parents: &[&str]) -> CommitSummary {
        CommitSummary {
            oid: oid.into(),
            parents: parents.iter().map(|s| (*s).into()).collect(),
            refs: vec![],
            author: "a".into(),
            timestamp: 0,
            subject: oid.into(),
        }
    }
    #[test]
    fn linear_history_stays_on_one_lane() {
        let p = HistoryPage {
            commits: vec![c("c", &["b"]), c("b", &["a"]), c("a", &[])],
            has_more: false,
        };
        assert_eq!(
            layout_history(&p)
                .rows
                .iter()
                .map(|r| r.lane)
                .collect::<Vec<_>>(),
            vec![0, 0, 0]
        );
    }
    #[test]
    fn merge_allocates_lane_for_second_parent() {
        let p = HistoryPage {
            commits: vec![c("m", &["a", "b"]), c("a", &[]), c("b", &[])],
            has_more: false,
        };
        let l = layout_history(&p);
        assert_eq!(l.rows[0].parent_lanes, vec![0, 1]);
        assert_eq!(l.lane_count, 2);
    }

    #[test]
    fn parent_already_open_keeps_its_lane_and_the_passing_lane() {
        let p = HistoryPage {
            commits: vec![
                c("merge", &["left", "right"]),
                c("left", &["base"]),
                c("right", &["base"]),
                c("base", &[]),
            ],
            has_more: false,
        };
        let l = layout_history(&p);
        let right = &l.rows[2];
        assert_eq!(right.lane, 1);
        assert_eq!(right.parent_lanes, vec![0]);
        assert!(right.active_lanes.contains(&0));
        assert!(right.active_lanes.contains(&1));
    }

    #[test]
    fn page_boundary_preserves_merge_lanes() {
        let first = HistoryPage {
            commits: vec![c("merge", &["left", "right"])],
            has_more: true,
        };
        let (head, state) = layout_page(&first, &LaneState::default());
        assert_eq!(head.rows[0].parent_lanes, vec![0, 1]);

        let next = HistoryPage {
            commits: vec![c("left", &["base"]), c("right", &["base"]), c("base", &[])],
            has_more: false,
        };
        let (tail, _) = layout_page(&next, &state);
        assert_eq!(tail.rows[0].lane, 0);
        assert_eq!(tail.rows[1].lane, 1);
        assert_eq!(tail.rows[1].parent_lanes, vec![0]);
        assert_eq!(
            tail.rows[1].connections,
            vec![Connection { from: 1, to: 0 }]
        );
        assert!(tail.rows[1].active_lanes.contains(&0));
    }
}
