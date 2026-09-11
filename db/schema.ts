import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const clusterVoteTotals = sqliteTable('cluster_vote_totals', {
  scale: integer('scale').notNull(),
  communityId: text('community_id').notNull(),
  communitySize: integer('community_size').notNull(),
  familiarityUnfamiliar: integer('familiarity_unfamiliar').notNull().default(0),
  familiarityModerate: integer('familiarity_moderate').notNull().default(0),
  familiarityVery: integer('familiarity_very').notNull().default(0),
  boundaryNoMatch: integer('boundary_no_match').notNull().default(0),
  boundaryModerateMatch: integer('boundary_moderate_match').notNull().default(0),
  boundaryStrongMatch: integer('boundary_strong_match').notNull().default(0),
  totalVotes: integer('total_votes').notNull().default(0),
  updatedAt: text('updated_at').notNull()
}, table => [primaryKey({ columns: [table.scale, table.communityId] })]);
