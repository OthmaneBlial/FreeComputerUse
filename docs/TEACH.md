# Teach a procedure

A procedure is a saved list of browser steps that FreeComputerUse replays
locally, with new values each time. You can make one in four ways:

1. **Show it**: record what you do in the browser.
2. **Write it**: list the steps in plain English or French.
3. **Keep a run**: save a task the AI completed as a procedure.
4. **Show one step**: when a run gets stuck, the agent pauses and records how you
   do that step, then continues.

Later requests reuse the procedure. "Deploy version 1.5 of app Snake Arena with
./app-1.5.aab" finds the right procedure even when the wording or language
differs. It reads the values it can from the request, asks only for the missing
ones, and replays without calling the model. The model is called only if a step
no longer matches the page. A successful repair is saved as a new version, and
the old target is kept as a fallback. If most steps stop matching, for example
because the interface is in another language, the agent plans the rest of the
task from the current page in one request, and the procedure's success check
still has to pass. When the new version has the same steps as the old one, each
step keeps both targets, so the procedure then runs on both interfaces without
the model.

## 1. Show it

Dashboard:

1. `npm run dev`, then open the printed local address.
2. Enter the **Starting page** and press **Teach me**.
3. Do the task in the live browser preview: click it, type with the text box
   under it, and press Enter there. For an upload, choose a file in the menu
   under the preview (files come from your local profile), then click the upload
   control.
4. Press **Save as procedure**. Review the recorded steps, give a name and a
   description. Under **Parameters**, name each value that changes between runs.
   For example, name `notes` for the release notes you typed. Uploads and hidden
   fields (passwords, one-time codes) become parameters automatically, and their
   values are never stored.

Terminal, in a real browser window:

```sh
npm run agent -- procedures teach https://console.example.test/apps \
  --name "Publish a production release" \
  --description "Upload an app bundle and send the release for review" \
  --param notes="Bug fixes" --expect-text "In review"
```

Do the task in the window that opens, then press Enter in the terminal.
`--param name=value` turns the value you typed into a parameter.

What is recorded: clicks, checkboxes, selections, typed text, uploads and Enter
presses, each with a description of the element (role, name, label and stable
id). It does not record screenshots or coordinates. Password, one-time-code and
card fields are recorded as steps without their values. A click that only opened
a file chooser is replaced by the upload itself. A long pause before a step
makes that step wait longer on replay.

## 2. Write it

One step per line. Put element names in quotes, and use `|` for alternatives,
for example the same button in two languages. `{{params.name}}` marks a
parameter.

```text
open https://console.example.test/play/console
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

| Step | English | French |
| --- | --- | --- |
| Open a page | `open URL`, `go to URL` | `ouvre URL`, `va sur URL` |
| Click | `click "Name"`, `click button "Name"`, `click link "Name"` | `clique sur "Nom"`, `clique sur bouton "Nom"` |
| Type | `type "value" into "Label"` | `saisis "valeur" dans "Libellé"` |
| Choose | `select "Option" in "Label"` | `choisis "Option" dans "Libellé"` |
| Upload | `upload {{params.file}} to "Label"` | `téléverse {{params.file}} dans "Libellé"` |
| Tick | `check "Label"`, `uncheck "Label"` | `coche "Libellé"`, `décoche "Libellé"` |
| Key | `press Enter in "Label"` | `appuie sur Entrée dans "Libellé"` |
| Wait | `wait for "text"` | `attends "texte"` |
| Success check | `expect "text"` | `vérifie "texte"` |

`wait for` and `expect` take `|` alternatives too; any one of the texts is
enough. Add `(sensitive)` to always ask before a step, and `(timeout 20s)` to wait
longer. Save with **Write steps** in the dashboard, or:

```sh
npm run agent -- procedures create --name "Publish a production release" --steps steps.txt
```

## 3. Keep a run

After a task completes, open **View result** and press **Save as procedure**, or
run `agent procedures` to see learned workflows. Name the values that should
change, as in section 1.

## 4. Show one step when stuck

With **When stuck, pause and ask me to show the step** on (Run options), a step
that fails after the allowed repairs pauses the run. The log says which step.
Do it yourself in the live browser and press **Resume agent**. Your actions
replace the failed step and are saved with the procedure's next version.

## Run a procedure

- Dashboard: type the request as usual. If a saved procedure matches, a form
  shows the values it read and asks for the rest. **Plan with AI instead**
  ignores the match. You can also use **Procedures → Run**.
- Terminal:

```sh
npm run agent -- procedures find "Déploie la version 1.5 de l'app \"Snake Arena\" avec ./app-1.5.aab"
npm run agent -- procedures run "Déploie la version 1.5 de l'app \"Snake Arena\" avec ./app-1.5.aab" --param notes="Corrections"
npm run agent -- procedures run 3c5574e806d965d1 --param app="Snake Arena" --param bundle=./app-1.5.aab
```

Missing values are asked in the terminal, or listed as an error when there is
no terminal. Values are read from a request when they follow a parameter's name
or alias ("version 1.5", "app Snake Arena"), are quoted, or are the only token
matching the parameter's pattern (for example the only `.aab` path). Put values
that contain spaces in quotes.

Sensitive steps such as publishing, paying, deleting, sending, sharing or
changing access still ask for confirmation on every run, and the prompt shows
what is on the page. A recorded demonstration is not a standing approval.

## Manage procedures

| Task | Dashboard | Terminal |
| --- | --- | --- |
| List with success rate | Procedures | `agent procedures` |
| Steps, versions, runs | View / edit | `agent procedures show <id>` |
| Edit steps or parameters | View / edit → Save as a new version | `procedures update` via the dashboard |
| Rename | Edit the `name` field | `agent procedures rename <id> "New name"` |
| Duplicate | Duplicate | `agent procedures duplicate <id>` |
| Restore an older version | View / edit → Restore | `agent procedures restore <id> <version>` |
| Export, import | Export, Import a procedure… | `agent procedures export <id> --out p.json`, `agent procedures import p.json` |
| Delete | Delete → Confirm delete | `agent procedures delete <id>` |

An export contains the steps, parameter names, checks and alternatives. It
never contains parameter values, file paths, run history or keys. Procedures
are stored in `<FCU_DATA_DIR>/history.sqlite` and survive restarts. Each keeps
up to ten previous versions.
