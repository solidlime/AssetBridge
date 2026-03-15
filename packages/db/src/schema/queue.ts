import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const jobQueue = sqliteTable("job_queue", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  type:        text("type").notNull(),
  status:      text("status").notNull().default("pending"),
  payload:     text("payload"),
  result:      text("result"),
  attempts:    integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  createdAt:   integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  startedAt:   integer("started_at", { mode: "timestamp" }),
  doneAt:      integer("done_at", { mode: "timestamp" }),
  error:       text("error"),
});
