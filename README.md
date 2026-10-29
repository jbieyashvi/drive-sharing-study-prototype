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

- There is one scenario and one restricted file at a time. There are no groups, link sharing, domain or Workspace admin policies, or ownership transfer.
- Changing roles (Viewer ↔ Editor) is not implemented. Only **Remove access** works.
- Moving into an *existing* limited-access folder is always unavailable, even after one has been created.
- The prototype doesn't model what happens to people who had direct access to the moved file, beyond checking for contradicting grants.
- State lives in memory only: refreshing the page resets everything, including the log.
- It is built for desktop widths. It was tested in Chrome only and has not been checked with a screen reader.
- The visuals are inspired by Drive but are not a copy, and no real Google assets are used. It is not pixel-perfect.
- Visual QA was done at 1440×900 and 1280×800 by loading the app in a fixed-size iframe, because the browser window couldn't be resized. The screenshots in `docs/screenshots/` were taken at about 1470×835.
- *Preview access as* deliberately lists items the person can't open, marked "Access required", so open-by-link can be inspected.
