# Local data

FreeComputerUse stores run history, learned workflows, the local profile, browser
session data and downloaded files in its data directory. By default this is
`.fcu` under the directory from which the CLI starts. `FCU_DATA_DIR` overrides
that path; relative overrides are also resolved from the starting directory.

The project-root `.env` file is separate. It can contain provider credentials
and is not included when you copy `.fcu`.

## Inspect

Stop the browser task first. In the project directory, inspect `.fcu` with your
file manager or list its contents in a terminal. The `profile.json` file stores
the values you entered; `history.sqlite` stores run traces and learned workflows;
`browser/` contains the persistent browser session; `downloads/` contains files
saved by tasks. These files are local and are not encrypted.

To inspect run summaries and learned workflows from a source checkout:

```sh
npm run agent -- history
npm run agent -- workflows
```

Treat full traces, profile values, browser data and downloads as private. Do not
attach them to an issue or share them without reviewing their contents.

## Retention

There is no automatic expiry or pruning. Run history, learned workflows, browser
sessions and downloads remain in the data directory until you remove it. The
CLI/dashboard history limits only limit how many summaries they display; they
do not delete older traces.

## Export

Stop FreeComputerUse, then copy the entire data directory to a private backup
location. Include hidden files. For a custom `FCU_DATA_DIR`, copy that directory
instead of `.fcu`. Keep the backup on storage protected by your OS account; it
contains browser sessions and may contain personal information.

macOS:

```sh
ditto .fcu /path/to/private-backup/fcu-data
```

Linux:

```sh
cp -a .fcu /path/to/private-backup/fcu-data
```

Windows PowerShell:

```powershell
Copy-Item -LiteralPath .fcu -Destination C:\path\to\private-backup\fcu-data -Recurse
```

## Delete

Stop FreeComputerUse and confirm the exact data directory before deleting it.
The following removes the default `.fcu` directory from the current project; it
does not remove `.env` or a custom `FCU_DATA_DIR` elsewhere.

macOS/Linux:

```sh
rm -r -- .fcu
```

Windows PowerShell:

```powershell
Remove-Item -LiteralPath .fcu -Recurse
```

To delete data stored at a custom `FCU_DATA_DIR`, substitute its resolved path
after checking that it is the intended directory. Removing this folder deletes
profiles, history, workflows, browser cookies/session data and task downloads.
