import "dotenv/config";
import { launchReadiness } from "../lib/server/operations/launch-readiness";
const report = launchReadiness();
console.log(JSON.stringify(report, null, 2));
if (!report.configurationReady) process.exitCode = 1;
