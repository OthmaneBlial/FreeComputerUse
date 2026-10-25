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
the confirmation dialog. Add these to the address to change it:

| Add | What changes |
| --- | --- |
| `?lang=fr` | French text |
| `?variant=2` | Renamed buttons, a new id and a banner |
| `?accounts=2` | A developer account must be chosen first |
| `?blocked=1` | A Data safety error blocks the submission |

Combine them with `&`, as in `?lang=fr&accounts=2`.

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
require "All apps" | "Toutes les applications"
click "View app: {{params.app}}" | "Afficher l'application: {{params.app}}"
click button "Test and release" | button "Tester et publier"
click "Production"
click button "Create new release" | button "Créer une release"
upload {{params.bundle}} to "Upload app bundle" | "Importer un app bundle"
wait for "({{params.version}})" (timeout 20s)
type "{{params.notes}}" into field "Release notes" | field "Notes de version"
click "Next" | "Suivant"
click "Save and publish" | "Enregistrer et publier" (sensitive)
click "Send changes for review" | "Envoyer les modifications pour examen"
expect "In review" | "En cours d'examen"
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
publish** and **Send changes for review** after reading the summary in each
prompt. The run ends on "Changes sent for review … In review", with zero model
calls.

Things to try:

- Add `?variant=2` to the starting page. Buttons change ("Next" becomes "Review
  release") and the model repairs the one step that broke. The fix is saved as
  version 2 of the procedure and the old target is kept as an alternative.
- Add `?lang=fr` for the French interface. Every step above has its French
  label after `|`, so the release goes through without a model call. On a
  procedure you taught in one language, the first run on the other language
  repairs two steps, then plans the rest from the page in one request. When
  the steps line up, the saved version keeps both labels and both success
  texts.
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

**Several developer accounts.** If the console asks you to choose an account,
make that choice a step with a parameter, such as
`click "{{params.account}}"`, so each request names the account. Or teach from
the app list of one account. Its address contains the account id, so replays
always open that account.

**Blocking errors.** When the console refuses a submission, for example because
a policy form is incomplete, the step fails and nothing is sent. The error says
why and quotes the console, as in "The control is disabled. The page says: Fix
this error before you send changes for review: complete the Data safety form in
App content." Fix it in the console, then run the procedure again.

**Signed out.** On 25 October 2026, opening `https://play.google.com/console`
signed out led to Google's marketing page (`google.play/business`), not to a
sign-in form. The `require "All apps"` line makes the run pause there with
"This procedure expects another starting state" instead of failing on the first
click. Sign in with **Take control**, open the app list and press **Resume agent**.

When the session expires, the run pauses on the sign-in page. Sign in yourself
and press **Resume agent**. If the console shows a new screen, such as a policy
declaration or a "Verify it's you" prompt, the step fails. With **When stuck,
pause and ask me to show the step** on, the run pauses so you can handle it.

## Measured on the simulator

With `deepseek-flash` on 25 October 2026, the first run took 8 model calls and
17,354 tokens. Replays with new values took none. A minor UI change took 4 calls
once, and the first French run took 7. After that, the procedure ran in both
languages with no model calls. Every run asked before Save and publish and before
Send changes for review. Details and limits are in
[BENCHMARKS.md](BENCHMARKS.md#procedures-and-token-savings).
