import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()
crons.daily("data retention (SEC-17)", { hourUTC: 3, minuteUTC: 0 }, internal.retention.purge, {})
crons.daily("demo workspace reset", { hourUTC: 3, minuteUTC: 30 }, internal.demo.reset, {})
export default crons
