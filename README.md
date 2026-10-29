# Drive sharing study prototype

A clickable desktop prototype for an independent product-design study. The study asks one question: can someone keep a project shared and still restrict one file (File A) from one collaborator (Alex), without removing anyone else's access?

It is **not** a Google product and it is not connected to Google Drive. There is no sign-in. All people, files and permissions are simulated in the browser's memory. Nothing is sent over the network: there is no analytics, no backend and no API calls.

## Run it

```bash
npm install
npm run dev
```

- Participant mode: http://localhost:5317
- Facilitator mode: http://localhost:5317/?mode=facilitator
- Version B: add `variant=B`, for example http://localhost:5317/?variant=B (participant) or http://localhost:5317/?mode=facilitator&variant=B (facilitator). `variant=A`, a missing value or any other value gives Version A.

Hosted copy (GitHub Pages, rebuilt on every push to `main`):

- Participant mode: https://jbieyashvi.github.io/drive-sharing-study-prototype/
- Facilitator mode: https://jbieyashvi.github.io/drive-sharing-study-prototype/?mode=facilitator

The hosted copy is the same static, fully simulated build. It makes no network calls and has no sign-in.
- To switch modes without visible controls, press **Alt+Shift+F**.

The port is fixed at 5317 (`strictPort`) so the study URL never changes. Other checks: `npm test` (model unit tests), `npm run lint`, `npm run build`.

## Scenario

`My Drive › Client Project` holds **File A.png** and **File B.png**. Both files get their access from the project folder:

| Person | Client Project |
| --- | --- |
| You | Owner |
| Maya | Editor |
| Ravi | Viewer |
| Alex | Editor |

Task: Alex should lose access to File A, keep access to the project and File B, and nobody else's access should change.

## Flow

1. Open the ⋮ menu for File A and choose **Share**. Next to Alex, the dialog says "Access comes from Client Project."
2. Open Alex's role menu and choose **Remove access**. This opens **Change Alex's access**, which offers two choices:
   - **Remove access to the project.** A review screen lists everything Alex would lose (the project, File A and File B). You must confirm it explicitly.
   - **Keep project access, restrict this file.** This starts the steps below.
3. **Choose a folder for File A.** Nothing is selected by default. Choosing an existing limited-access folder isn't supported, so that option sends you to **Create a new folder**. The name defaults to "Private files". Empty names and duplicate names (ignoring case) are rejected.
4. **Who can open File A?** You is locked in. Maya and Ravi are selected and Alex is not. If you reselect Alex, the screen says Alex will keep access.
5. **Review access changes.** This screen shows a before/after table and the planned operations, with the note "No changes applied yet."
6. **Applying**, then the **result** screen, which lists the operations performed, the new location, who can open the file, and confirms that project access is unchanged.

Back keeps every choice you made. If you close the flow with unapplied choices, it asks you to confirm before discarding them. Escape and Cancel never apply anything.

## Version B (comparison variant)

One participant found Version A long and suggested putting a restrict action in the collaborator's role menu. Version B builds that idea so the two flows can be compared. It is **not validated, and it is not assumed to be better.** Fewer screens or clicks in B is not evidence of better usability.

- **Entry point.** Alex's role menu in File A's Share dialog lists Viewer, Commenter and Editor, then a divider, then **Restrict access to this file…** and a separate **Remove access…**. Restrict is not a role and changes nothing by itself. It skips A's decision screen and opens a single setup screen. Remove access works the same way as in A.
- **Setup: "Restrict access to File A."**
  - Planned-access summary: sits just below the title, outside the scrolling area, so it is always visible. It is built from the current selections, for example "✕ Alex will lose access to File A. ✓ Maya and Ravi will keep access. = Access to the rest of Client Project stays unchanged." If everyone is selected it says "Everyone will keep access to File A." It describes planned changes only, and screen readers announce it politely when it changes.
  - Destination (compact): "Move File A.png into a new limited-access folder", then "Inside: Client Project", then an inline **Folder name** field. The name defaults to "Private files" and is checked the same way as in A.
  - An optional, collapsed **Use an existing limited-access folder instead** shows the same empty state as A.
  - Who keeps access: uses the same checkboxes, roles and per-person status as A. B's summary replaces A's ☑/☐ explainer and callouts.
  - The footer says "No changes applied yet." and has **Cancel** and **Review changes**.
  - At 1280×720 the summary and all four people are visible when the screen opens; only the last helper line needs a short scroll. At 1440×900 nothing scrolls.
- **After setup.** Review, applying, the result, and the failure/Retry handling are the same screens as in A, and they are built from B's selections. Back from review returns to setup with everything kept. Cancel and Escape use the same discard confirmation as A.
- **Isolation.**
  - Each version keeps its own scenario state. The facilitator drawer shows the active version and can switch it. Switching closes any open flow and discards unapplied choices.
  - **Reset scenario** resets both versions to the same starting data.
  - Participant screens never show which version is active.
- **Logging.** Every log entry has a `variant` field (`"A"` or `"B"`). The download is named `study-log-<variant>-….json`.

## Scenario 2: restore access to one private file

Facilitator-only, for isolated testing. The same Add people flow also works on any file in the restrict scenario, including File A after it has been restricted. Open http://localhost:5317/?mode=facilitator&scenario=restore, or choose **Scenario → Restore access to one private file** in the facilitator drawer. If a share flow is open, the drawer asks before switching and discarding its unapplied choices. Switching restarts both versions (A and B) from that scenario. Without `scenario=restore` the original restrict task loads.

`Client Project` holds **File B.png** and the limited-access folder **Private files**, which holds **File A.png** and **File C.png**:

| Person | Client Project, File B | Private files, File A, File C |
| --- | --- | --- |
| You | Owner | Owner |
| Maya | Editor | Editor |
| Ravi | Viewer | Viewer |
| Alex | Editor | No access |

Task: Alex should be able to open File C as Viewer. Nothing else should change: not the folder, not File A, and nobody else's access.

1. Open **Private files**, then File C's ⋮ menu → **Share**, then **Add people…**. The screen says "This shares File C only. It does not share the Private files folder or the other files inside it."
2. Type a name or email and pick Maya, Ravi or Alex from the list. Arrow keys, Enter and Escape work in the list. Role defaults to **Viewer** (Viewer, Commenter or Editor). Picking a person or role changes nothing.
3. **Review sharing for File C.** This shows the file, location, person and planned role. A before/after table covers File C, File A, Private files, Client Project and File B. Only File C changes. A line confirms that You, Maya and Ravi keep their access.
4. **Share File C** → applying → **"Alex can open File C as Viewer."** and **"Other private files and folder access were not changed."** Buttons: **Copy file link** and **Done**. Copy file link copies a placeholder `example.com` URL and changes no permissions. No email is simulated.

The only change is a direct grant on File C. Alex is never added to the folder, File C is never moved, and limited access is never turned off. A direct grant opens the file by link even though its parent folder blocks inherited access. This uses the same access rule as the facilitator matrix and *Open by direct link*.

Validation:
- Continuing with no recipient is blocked.
- An email that isn't a study account is refused ("Study accounts only").
- A recipient who already has access is shown with their role and its source, and nothing is shared again.
- The same person can't be added twice, and only one person can be added at a time.
- The latest role choice is used.
- Choosing **Share** on a folder shows a toast explaining that folder sharing isn't available. It never shares the folder silently.

Back keeps the draft. Escape, Cancel and ✕ ask before discarding a selected recipient, and they never apply anything. Failure simulation and Retry work as in the restrict flow, and Retry never duplicates a grant. Log entries carry a `scenario` field (`"restrict"` or `"restore"`). Recipient and role choices, review, confirmation, success or failure, and direct-link attempts are all logged.

## Drive-like shell (Phase 2)

- The header has a generic brand mark, search, and a persistent label: *Independent study prototype — not affiliated with Google.* The sidebar has New, Home, My Drive, Computers, Shared with me, Recent, Starred, Spam, Trash and a Storage bar. There is also a right app rail that can be collapsed.
- The file list has a breadcrumb with a folder menu, Type/People/Modified/Source filter chips, a list/grid toggle, and a details (i) pane. Columns are Name, Owner, Date modified and File size. Rows have hover and selected states, plus a selection toolbar and row menus.
- Search filters items across the project and shows their paths. There are empty and no-results states. Sidebar sections other than My Drive show mock or empty views.
- Anything that isn't part of the study shows a toast such as *Not available in this prototype*. It never fakes success.
- The font stack prefers Google Sans only if it is installed locally. Otherwise it falls back to Roboto, Helvetica Neue and system fonts. No fonts or images are downloaded from Google.
- People and emails are invented (`@example.com`). No real Google logos or icons are used.

## What is simulated (facilitator mode only)

The facilitator tools are in a separate overlay drawer with an amber border. It is clearly not part of Drive and is **closed by default**. Open it with the dashed *Facilitator tools* button (bottom right) or **Alt+Shift+F**. The drawer and its button only exist with `?mode=facilitator`. Participant mode shows no facilitator UI.


- **Reset scenario.** Restores the starting data, closes any open flow and clears the event log.
- **Failure simulation.** Set it to "Fail next attempt only" or "Fail every attempt". A failure is all-or-nothing: no changes are applied, and the participant sees a short message, *Changes couldn’t be applied — Nothing changed. Try again.*, with **Back to review** and **Retry**. Retry reuses the same reviewed choices. The all-or-nothing explanation appears only here and in the facilitator drawer. This does not model how Drive actually fails.
- **Preview access as** You, Maya, Ravi or Alex, plus **Open by link** buttons. Items the person can open show a preview; the rest show "You need access". This is an inspection tool, not a proposed Drive feature.
- **Current simulated access.** A matrix of every item and person. It uses the same rule as opening files, so the two always agree.
- **Event log.** Records screens, choices, confirmations, successes, failures and open attempts, with elapsed times. It is kept in memory only. **Download JSON** saves it as a local file. Elapsed times are prototype timings, not product performance.
  - `screen_opened` is logged once per screen change, when the change happens, not on render. This means React StrictMode's double render doesn't create duplicates. Reset clears the log.
  - Timing limitations: times come from `performance.now()` in a single tab. The "applying" step includes a fixed simulated delay of about 1.4 s. Time spent in a background tab, or with a facilitator watching, is counted as normal.

Access works as follows. An item's access is the most permissive grant found by walking up its folders, as long as each folder inherits. The new limited-access folder does not inherit, so only the people chosen in step 4 can open it.

## Limitations

- There are two scenarios (restrict one file, restore one private file). There are no groups, link sharing, domain or Workspace admin policies, or ownership transfer.
- Changing an existing person's role (Viewer ↔ Editor) is not implemented. Only **Remove access** works, plus **Restrict access to this file…** in Version B.
- **Add people** works for any file in both scenarios and both versions, one study person at a time. For example, after restricting File A you can share File A back with Alex, and the new limited-access folder stays blocked. Folder sharing is never available.
- *Copy file link* copies a placeholder `https://example.com/study-file/…` URL. It isn't a working link.
- Version B has not been tested with participants. Comparing A and B needs a proper study, and step or click counts alone don't measure usability.
- Moving into an *existing* limited-access folder is always unavailable, even after one has been created.
- The prototype doesn't model what happens to people who had direct access to the moved file, beyond checking for contradicting grants.
- State lives in memory only: refreshing the page resets everything, including the log.
- It is built for desktop widths. It was tested in Chrome only and has not been checked with a screen reader.
- The visuals are inspired by Drive but are not a copy, and no real Google assets are used. It is not pixel-perfect.
- Visual QA was done at 1440×900 and 1280×800 by loading the app in a fixed-size iframe, because the browser window couldn't be resized. The screenshots in `docs/screenshots/` were taken at about 1470×835.
- *Preview access as* deliberately lists items the person can't open, marked "Access required", so open-by-link can be inspected.
