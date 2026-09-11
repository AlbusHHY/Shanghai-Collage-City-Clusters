CREATE TABLE IF NOT EXISTS cluster_vote_totals (
  scale INTEGER NOT NULL CHECK (scale BETWEEN 1 AND 5),
  community_id TEXT NOT NULL,
  community_size INTEGER NOT NULL CHECK (community_size BETWEEN 1 AND 5956),
  familiarity_unfamiliar INTEGER NOT NULL DEFAULT 0 CHECK (familiarity_unfamiliar >= 0),
  familiarity_moderate INTEGER NOT NULL DEFAULT 0 CHECK (familiarity_moderate >= 0),
  familiarity_very INTEGER NOT NULL DEFAULT 0 CHECK (familiarity_very >= 0),
  boundary_no_match INTEGER NOT NULL DEFAULT 0 CHECK (boundary_no_match >= 0),
  boundary_moderate_match INTEGER NOT NULL DEFAULT 0 CHECK (boundary_moderate_match >= 0),
  boundary_strong_match INTEGER NOT NULL DEFAULT 0 CHECK (boundary_strong_match >= 0),
  total_votes INTEGER NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scale, community_id)
);

