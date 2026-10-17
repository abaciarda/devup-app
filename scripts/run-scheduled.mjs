import { pathToFileURL } from "node:url";
import {
  runScheduled,
  ScheduledAttentionError,
} from "./lib/scheduled-request.mjs";
export {
  runScheduled,
  ScheduledAttentionError,
} from "./lib/scheduled-request.mjs";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runScheduled(process.argv[2], {
    siteUrl: process.env.SITE_URL,
    secret: process.env.CRON_SECRET,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        error instanceof ScheduledAttentionError
          ? error.message
          : "Scheduled operation failed or needs review; check the private admin workspace and workflow settings",
      );
      process.exitCode = 1;
    });
}
