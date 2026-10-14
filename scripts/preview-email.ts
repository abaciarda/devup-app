import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  renderConfirmationEmail,
  renderDigestEmail,
} from "../lib/email/render";
import { emailFixture } from "./email-fixture";

const fixture = emailFixture();
const directory = resolve("docs/setup/email-preview");
await mkdir(directory, { recursive: true });
for (const language of ["en", "tr"] as const) {
  const confirmation = await renderConfirmationEmail(
    {
      sendId: fixture.sendId,
      email: fixture.email,
      language,
      token: fixture.token,
    },
    fixture.settings,
  );
  const digest = await renderDigestEmail(
    {
      sendId: fixture.sendId,
      email: fixture.email,
      language,
      issue: fixture.issue,
      unsubscribeToken: fixture.unsubscribeToken,
      preferencesToken: fixture.preferencesToken,
    },
    fixture.settings,
  );
  for (const [name, message] of [
    ["confirmation", confirmation],
    ["digest", digest],
  ] as const) {
    await writeFile(
      resolve(directory, `${name}-${language}.html`),
      message.payload.html,
      "utf8",
    );
    await writeFile(
      resolve(directory, `${name}-${language}.txt`),
      message.payload.text,
      "utf8",
    );
  }
}
console.log(
  "Eight synthetic preview files saved under docs/setup/email-preview; no email sent",
);
