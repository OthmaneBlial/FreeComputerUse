# Google Play releases

Teach FreeComputerUse a Play Console release once. Later, a request such as

> Publie la version 1.5 de l'app "Snake Arena" avec ./build/snake-1.5.aab

replays it with the new values. It asks only for the values it could not read
from the request and stops for your approval before anything is submitted.

What it will and will not do:

- **You sign in.** It never types your Google password, never answers a 2-Step
  Verification prompt and never solves a CAPTCHA. When it sees a sign-in or
  "Verify it's you" page, it pauses so you can take control.
- **You approve the submission.** "Save and publish", "Send changes for review",
  "Roll out", "Release to production" and similar buttons ask every time, and the
  approval shows the release summary on the page. A recorded demonstration is
  never a standing approval.
- **"In review" is not "published".** The procedure ends when the console says
  the changes were sent for review. Google then reviews the release. The run
  reports what the page says. It does not report a publication it cannot see.

## 1. Practise on the local simulator

The repository includes a small Play Console look-alike at
`fixtures/playConsole.ts`. It is not Google software and does not copy Google's
markup. It reproduces the release flow, including bundle processing, review and
the confirmation dialog, with English and French text and a variant with
renamed buttons.

```sh
npm run fixtures        # serves http://127.0.0.1:3000
npm run dev             # dashboard, in another terminal
```

A simulator bundle is any text file with a version code and name:

```sh
mkdir -p build
printf 'versionCode=15\nversionName=1.5\n' > build/snake-1.5.aab
```

In the dashboard, press **Write steps** and paste:

```text
open http://127.0.0.1:3000/play/console
click "View app: {{params.app}}" | "Afficher l'application: {{params.app}}"
click button "Test and release" | button "Tester et publier"
click "Production"
click button "Create new release" | button "Créer une release"
upload {{params.bundle}} to "Upload app bundle"
wait for "({{params.version}})" (timeout 20s)
type "{{params.notes}}" into field "Release notes"
click "Next"
click "Save and publish" (sensitive)
click "Send changes for review"
expect "In review"
```

Name it "Publish a Play production release". Give these parameters a few
request words, so requests in either language find them:

| Parameter | Kind | Request words |
| --- | --- | --- |
| `app` | text | `app, application, l'app` |
| `bundle` | file | `aab, bundle, fichier` |
| `version` | text | `version` |
| `notes` | text | `notes, release notes` |

The version code and name only appear after the console has processed the
bundle, so `wait for "({{params.version}})"` waits for processing in any
language.

Alternatively, press **Teach me** with the starting page above and do the release
yourself once, as described in [Teach a procedure](TEACH.md#1-show-it).

Leave **Starting page** empty, or set it to the console: a procedure is only
offered for requests on its own site. Then type a request in the main box:

```text
Publie la version 1.5 de l'app "Snake Arena" avec ./build/snake-1.5.aab
```

The dashboard finds the procedure, fills in `app`, `version` and `bundle`, and
asks for `notes`. Press **Run**. Approve the site once, then approve **Save and
publish** after reading the summary in the prompt. The run ends on
"Changes sent for review … In review", with zero model calls.

Things to try:

- Add `?variant=2` to the starting page. Buttons change ("Next" becomes "Review
  release") and the model repairs the one step that broke. The fix is saved as
  version 2 of the procedure and the old target is kept as an alternative.
- Add `?lang=fr` for the French interface. The clicks with a `|` alternative
  still match, but the notes field, **Next**, the publish buttons and the
  `expect` text are different, so those steps need a model repair. `wait for` and
  `expect` take a single text. For a console in another language, duplicate
  the procedure and translate those steps, or add `|` alternatives to every
  click and field.
- Use a bundle whose `versionCode` was already used. The simulator rejects it,
  and the run fails at the `wait for` step, before anything is submitted.

The terminal does the same:

```sh
npm run agent -- procedures find "Publie la version 1.5 de l'app \"Snake Arena\" avec ./build/snake-1.5.aab"
npm run agent -- procedures run "Publie la version 1.5 de l'app \"Snake Arena\" avec ./build/snake-1.5.aab" --param notes="Corrections"
```

Approvals in the terminal need an interactive terminal. Without one, the
sensitive step is rejected and the run stops.

## 2. Use it on the real Play Console

> These steps have **not** been run against the real Play Console. They follow
> the simulator flow, and Google's labels, layout and confirmation dialogs may
> differ or change. Teach the real flow once and expect the first runs to need
> repairs or a demonstration.

1. Start `npm run dev`, set **Starting page** to
   `https://play.google.com/console`, and press **Teach me**. The dashboard
   browser keeps its own profile in `<FCU_DATA_DIR>`, so sign in there once.
   Use **Take control** and type the password and any 2-Step Verification code
   yourself.
2. Record one release on a track you can afford to experiment with, such as
   **Internal testing**, before you teach production.
3. Save it with the parameters above. For a production procedure, turn on
   **Managed publishing** in the Play Console if you want a second, manual
   gate after the review step.
4. Run it from a request. Check the summary in the approval prompt, especially
   the version code, the track and the release notes.

When the session expires, the run pauses on the sign-in page. Sign in yourself
and press **Resume agent**. If the console shows a new screen, such as a policy
declaration or a "Verify it's you" prompt, the step fails. With **When stuck,
pause and ask me to show the step** on, the run pauses so you can handle it.

## Measured on the simulator

Real model calls and token counts for a first run, replays, a minor UI change
and a French UI are in
[BENCHMARKS.md](BENCHMARKS.md#procedures-and-token-savings).
