import type { JourneyInventoryRow } from "@sergeiwallace/frontend-test-harness";

/** Every existing spec title, each covered by the probes the checkpoint fixture runs in it. */
export const SPEC_TITLES: readonly (readonly [string, string])[] = [
  [
    "analytics.spec.ts",
    "should draw throughput, cycle time, cumulative flow, the sprint burndown and aging work",
  ],
  [
    "analytics.spec.ts",
    "should show cost and tokens for an issue closed with a session id where an export is configured",
  ],
  [
    "auth.spec.ts",
    "should open the Board from the one-time link and leave no token in the URL or in browser storage",
  ],
  ["auth.spec.ts", "should refuse the link a second time and set no cookie"],
  ["auth.spec.ts", "should show the sign-in page, and no Board, without a session"],
  ["auth.spec.ts", "should open on the session cookie alone, with no token in its URL"],
  ["auth.spec.ts", "should refuse a form post and a fetch from another origin, and write nothing"],
  ["auth.spec.ts", "should revoke the session on the server and clear its cookie"],
  ["auth.spec.ts", "should refuse a request with forged Tailscale identity headers and no session"],
  ["backlog.spec.ts", "should list open issues by priority, then rank, then age"],
  ["backlog.spec.ts", "should write a row's priority and status with guarded writes"],
  [
    "backlog.spec.ts",
    "should show a conflict toast and keep the store's value when the status changed elsewhere",
  ],
  ["board.spec.ts", "should render one column per bd status, grouped by category in bd's order"],
  [
    "board.spec.ts",
    "should write the status with a guarded update when a card is dropped on a column",
  ],
  [
    "board.spec.ts",
    "should roll the card back and show a conflict toast when the drop's write exits 13",
  ],
  [
    "detail.spec.ts",
    "should show the issue's fields, description and comments as the store holds them",
  ],
  [
    "detail.spec.ts",
    "should show a failed read with its source and its store, never as empty fields",
  ],
  ["detail.spec.ts", "should show the issue's links, each opening the linked issue"],
  ["detail.spec.ts", "should change an unclaimed issue's owner from its detail"],
  [
    "detail.spec.ts",
    "should run nothing from a description's script tags, event handlers or javascript: links, and leave those links inert",
  ],
  [
    "detail.spec.ts",
    "should refuse an inline script and a string written to a script sink in the served app",
  ],
  [
    "detail.spec.ts",
    "should render a held item's full Markdown body with its option card above it",
  ],
  [
    "drafts.spec.ts",
    "should list a drafted MCP prompt under Drafts and send it only when the user confirms it",
  ],
  [
    "mcp-app.spec.ts",
    "should show a drafted prompt with its Confirm control and call the confirm tool only when it is pressed",
  ],
  [
    "mcp-app.spec.ts",
    "should confirm a typed prompt in the view before calling the send tool, and call nothing when it is cancelled",
  ],
  ["palette.spec.ts", "should move the selected card without a drag when Move to runs from Ctrl+K"],
  ["palette.spec.ts", "should open on Cmd+K too"],
  [
    "rank.spec.ts",
    "should write a key between the new neighbours and renumber no other card when a card is dragged within its column",
  ],
  ["review.spec.ts", "should answer a held decision with one key after the undo window"],
  ["review.spec.ts", "should cancel a one-key answer on Escape and write nothing"],
  [
    "review.spec.ts",
    "should carry its filters in the URL and draw the same list when the URL is opened",
  ],
  [
    "review.spec.ts",
    "should send a prompt from the composer, keep its action on screen and show it queued",
  ],
  [
    "review.spec.ts",
    "should offer the skill catalog on / in the composer and complete the chosen skill",
  ],
  ["review.spec.ts", "should refuse a prompt holding a secret and name the rule without the text"],
  [
    "review.spec.ts",
    "should unblock a task with a resolution and hold its next-step prompt until the unblock is acted on",
  ],
  [
    "roadmap.spec.ts",
    "should place epics and milestones by due date and draw their dependency lines",
  ],
  ["roadmap.spec.ts", "should open an epic's detail from its bar"],
  ["roadmap.spec.ts", "should say so when no epic or milestone has a due date"],
  ["run.spec.ts", "should serve the web app on a local port and show the Board within 10 seconds"],
  [
    "sessions.spec.ts",
    "should list the store's assignees and say liveness is unavailable when queue.url is empty",
  ],
  [
    "shell.spec.ts",
    "should toggle the sidebar with Ctrl+B outside a text field and not inside one",
  ],
  [
    "shell.spec.ts",
    "should name every bar control and reach the bar and its menus from the keyboard in order",
  ],
  [
    "stores.spec.ts",
    "should show every open store's cards naming their repository, and narrow to the store the picker chooses, in the URL",
  ],
  ["stores.spec.ts", "should keep showing the other stores and name the one that cannot be read"],
  ["stores.spec.ts", "should keep two issues with one id apart and write each to its own store"],
  ["tabs.spec.ts", "should hold one event stream for two tabs and deliver each change to both"],
  [
    "tabs.spec.ts",
    "should hand the stream to another open tab within the poll interval when the holding tab closes",
  ],
  [
    "tabs.spec.ts",
    "should load the Board under /beads with every asset and API call under it, and register no service worker",
  ],
  ["touch.spec.ts", "should give every draggable card a Move to menu that moves it with taps"],
  ["touch.spec.ts", "should reorder a card one place up from its Move to menu, with no drag"],
  [
    "views.spec.ts",
    "should list the selected sprint's issues as a board and as a list, with every open sprint and the backlog in its picker",
  ],
  [
    "views.spec.ts",
    "should move an issue from the backlog to a sprint from its Move to menu through a guarded bd write",
  ],
  [
    "views.spec.ts",
    "should move an issue to a sprint by dragging it onto the sprint in the picker",
  ],
  ["views.spec.ts", "should move an issue back to the backlog from the command palette"],
  ["views.spec.ts", "should write a card's priority in place and show the new value"],
  [
    "views.spec.ts",
    "should roll back to the stored value and name the field when the write is a conflict",
  ],
  [
    "views.spec.ts",
    "should offer the store's sessions in a card's owner picker and write an unclaimed task's owner",
  ],
  ["views.spec.ts", "should write an unclaimed task's owner from a list row's owner picker"],
  [
    "views.spec.ts",
    "should reorder a backlog row by its Down button, writing a key between its neighbours",
  ],
  ["views.spec.ts", "should reorder a backlog row by dragging it below another"],
  [
    "views.spec.ts",
    "should list every open task by priority, rank and age, saying so, and show only blocked tasks with their blocker under the filter",
  ],
  [
    "views.spec.ts",
    "should encode a filter in the URL and show the same list when that URL is opened",
  ],
];

/**
 * beads-ui's interactions that are neither a route nor a screen state: the keyboard and touch
 * paths a person takes. The adapter lists each as a surface; the inventory below covers it.
 */
export const INTERACTIONS: readonly { id: string; kind: "keyboard" | "touch"; evidence: string }[] =
  [
    {
      id: "keyboard:palette-chord",
      kind: "keyboard",
      evidence: "usePaletteChord in client/App.tsx (Ctrl K)",
    },
    {
      id: "keyboard:escape-closes-palette",
      kind: "keyboard",
      evidence: "CommandPalette Dialog.Root",
    },
    {
      id: "keyboard:review-shortcuts",
      kind: "keyboard",
      evidence: "useKeymap in client/review.tsx",
    },
    {
      id: "touch:move-to-menu",
      kind: "touch",
      evidence: "MoveToMenu, the touch path for a card move",
    },
  ];

/** The empty and error states the screens declare (screens/*.ts). */
export const DECLARED_STATES: readonly { id: string; kind: "empty" | "error"; screen: string }[] = [
  ...["board", "roadmap", "sessions", "review", "queue"].map((screen) => ({
    id: `empty:${screen}`,
    kind: "empty" as const,
    screen,
  })),
  ...[
    "board",
    "backlog",
    "roadmap",
    "analytics",
    "sessions",
    "review",
    "sprints",
    "queue",
    "issue-detail",
    "held",
  ].map((screen) => ({ id: `error:${screen}`, kind: "error" as const, screen })),
];

const journey = (id: string) => ({ kind: "journey" as const, id });
const probe = (id: string) => ({ kind: "probe" as const, id });

const row = (
  id: string,
  surface: string,
  kinds: JourneyInventoryRow["kinds"],
  coveredBy: JourneyInventoryRow["coveredBy"],
  evidence: string[],
): JourneyInventoryRow => ({ id, surface, kinds, coveredBy, evidence });

const TAB_SCREENS = [
  "board",
  "backlog",
  "roadmap",
  "analytics",
  "sessions",
  "review",
  "sprints",
  "queue",
];

/**
 * The finite inventory (T-1.4, T-1.7): every supported route, authenticated mutation route,
 * dialog and menu state, keyboard and touch interaction, declared empty and error state, fault,
 * stress pattern and existing spec title, each mapped to the journey or named probe covering it.
 * `checkInventory` compares it with the adapter's surfaces(), so a new route, state or spec
 * without a row here fails the check.
 */
export const inventory: readonly JourneyInventoryRow[] = [
  ...TAB_SCREENS.map((screen) =>
    row(`route-${screen}`, `screen:${screen}`, ["route"], journey("switch-every-tab"), [
      `VIEWS ${screen}`,
    ]),
  ),
  row("route-issue-detail", "screen:issue-detail", ["route"], journey("open-an-issue"), [
    "issues/:id",
  ]),
  row("route-held", "screen:held", ["route"], probe("capture"), ["held?path="]),
  row("route-signed-out", "screen:signed-out", ["route"], journey("sign-out"), [
    "the 401 sign-in page",
  ]),
  row("route-link-fresh", "screen:sign-in-link-fresh", ["route"], probe("capture"), [
    "api/auth/v1/exchange",
  ]),
  row("route-link-used", "screen:sign-in-link-used", ["route"], probe("capture"), [
    "api/auth/v1/exchange",
  ]),
  row("route-link-expired", "screen:sign-in-link-expired", ["route"], probe("capture"), [
    "api/auth/v1/exchange",
  ]),
  row("route-mcp-app", "screen:mcp-app", ["route"], probe("capture"), ["ui://beads-ui/board"]),

  row(
    "dialog-palette",
    "state:board:dialog:command-palette",
    ["dialog"],
    journey("open-the-command-palette"),
    ["CommandPalette"],
  ),
  row("menu-move-to", "state:board:menu:move-to", ["menu"], journey("move-a-card-by-menu"), [
    "MoveToMenu",
  ]),
  row("menu-owner-picker", "state:backlog:menu:owner-picker", ["menu"], probe("capture"), [
    "OwnerPicker",
  ]),

  row(
    "mutation-status",
    "mutation:POST /api/issues/:id/status",
    ["mutation"],
    journey("move-a-card-by-menu"),
    ["statusRoute"],
  ),
  row(
    "mutation-priority",
    "mutation:POST /api/issues/:id/priority",
    ["mutation"],
    probe("health"),
    ["backlog.spec.ts"],
  ),
  row("mutation-rank", "mutation:POST /api/issues/:id/rank", ["mutation"], probe("health"), [
    "rank.spec.ts",
  ]),
  row("mutation-sprint", "mutation:POST /api/issues/:id/sprint", ["mutation"], probe("health"), [
    "views.spec.ts",
  ]),
  row("mutation-owner", "mutation:POST /api/issues/:id/owner", ["mutation"], probe("health"), [
    "views.spec.ts",
  ]),
  row(
    "mutation-list-rank",
    "mutation:POST /api/issues/:id/list-rank",
    ["mutation"],
    probe("health"),
    ["views.spec.ts"],
  ),
  row(
    "mutation-dispatch-prompt",
    "mutation:POST /api/dispatch/prompt",
    ["mutation"],
    probe("health"),
    ["review.spec.ts"],
  ),
  row(
    "mutation-dispatch-answer",
    "mutation:POST /api/dispatch/answer",
    ["mutation"],
    probe("health"),
    ["review.spec.ts"],
  ),
  row(
    "mutation-dispatch-unblock",
    "mutation:POST /api/dispatch/unblock",
    ["mutation"],
    probe("health"),
    ["review.spec.ts"],
  ),
  row(
    "mutation-dispatch-deliver-now",
    "mutation:POST /api/dispatch/:id/deliver-now",
    ["mutation"],
    probe("health"),
    ["review.spec.ts"],
  ),
  row(
    "mutation-draft-confirm",
    "mutation:POST /api/drafts/:id/confirm",
    ["mutation"],
    probe("health"),
    ["drafts.spec.ts"],
  ),
  row("mutation-logout", "mutation:POST /api/auth/v1/logout", ["mutation"], journey("sign-out"), [
    "auth.ts logout",
  ]),

  row(
    "keyboard-palette-chord",
    "keyboard:palette-chord",
    ["keyboard"],
    journey("open-the-command-palette"),
    ["Ctrl K"],
  ),
  row(
    "keyboard-escape",
    "keyboard:escape-closes-palette",
    ["keyboard"],
    journey("open-the-command-palette"),
    ["Escape"],
  ),
  row("keyboard-review-shortcuts", "keyboard:review-shortcuts", ["keyboard"], probe("health"), [
    "review.spec.ts",
  ]),
  row("touch-move-to-menu", "touch:move-to-menu", ["touch"], journey("move-a-card-by-menu"), [
    "touch.spec.ts",
  ]),

  ...DECLARED_STATES.map((state) =>
    row(
      `${state.kind}-${state.screen}`,
      state.id,
      [state.kind],
      state.id === "error:board" ? journey("failing-backend") : probe("capture"),
      [`screens/${state.screen}`],
    ),
  ),

  ...[
    "feed-drop",
    "server-restart",
    "session-expiry",
    "slow-backend",
    "failing-backend",
    "serialised-backend",
    "offline",
  ].map((fault) =>
    row(`fault-${fault}`, `fault:${fault}`, ["fault"], journey(fault), ["Faults and stress"]),
  ),
  ...["double-submit", "two-tabs", "rapid-navigation", "large-data"].map((stress) =>
    row(`stress-${stress}`, `stress:${stress}`, ["stress"], journey(stress), ["Faults and stress"]),
  ),

  ...SPEC_TITLES.map(([file, title], index) =>
    row(`spec-${index + 1}`, `spec:${title}`, ["existing-spec"], probe("capture"), [file]),
  ),
];
