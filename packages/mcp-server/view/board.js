// The MCP App's board view (beads-ui design T-4.1 and T-4.2, web app design Phase W4): a draft
// the model asked for, shown with the Confirm control that sends it, and a Send control for a
// prompt the user types here. Both call the server's app-only tools; nothing here posts into the
// Claude conversation. Every text is set with textContent, never parsed as HTML.

const { App, applyDocumentTheme, applyHostStyleVariables } = globalThis.McpApps;

const app = new App(
  { name: "beads-ui board", version: "0.1.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
);

const status = document.getElementById("status");
const list = document.getElementById("drafts");
const empty = document.getElementById("no-drafts");
const form = document.getElementById("send");

const say = (text) => {
  status.textContent = text;
};

const resultText = (result) =>
  (result?.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

function applyHost(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}

function showDraft(draft) {
  empty.hidden = true;
  const item = document.createElement("li");
  item.dataset.draft = draft.id;
  const heading = document.createElement("p");
  heading.textContent = `Draft ${draft.id} for ${draft.task} in ${draft.repo}`;
  const body = document.createElement("pre");
  body.textContent = draft.text ?? "";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.textContent = "Confirm and send";
  const outcome = document.createElement("p");
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    const result = await app.callServerTool({
      name: "beads_dispatch_confirm",
      arguments: { draft: draft.id },
    });
    outcome.textContent = resultText(result);
    if (result.isError) confirm.disabled = false;
  });
  item.append(heading, body, confirm, outcome);
  list.append(item);
}

app.ontoolresult = (result) => {
  const draft = result?.structuredContent?.draft;
  if (draft !== undefined && draft.state === "draft") showDraft(draft);
};
app.onhostcontextchanged = (context) => applyHost(context);

// Send is a write, so it is confirmed here before the tool is called (T-4.2): the form only fills
// the confirmation, and "Send it" makes the call.
const confirmBox = document.getElementById("send-confirm");
const confirmYes = document.getElementById("send-confirm-yes");
let pending;

/** A request id the web server accepts once; getRandomValues works where randomUUID does not. */
const requestId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  pending = {
    id: requestId(),
    repo: String(data.get("repo")),
    task: String(data.get("task")),
    text: String(data.get("text")),
  };
  document.getElementById("send-confirm-target").textContent =
    `To the session that owns ${pending.task} in ${pending.repo}`;
  document.getElementById("send-confirm-text").textContent = pending.text;
  confirmBox.hidden = false;
});

document.getElementById("send-confirm-no").addEventListener("click", () => {
  pending = undefined;
  confirmBox.hidden = true;
  say("Not sent.");
});

confirmYes.addEventListener("click", async () => {
  if (pending === undefined) return;
  const args = pending;
  pending = undefined;
  confirmYes.disabled = true;
  const result = await app.callServerTool({ name: "beads_dispatch_send", arguments: args });
  confirmYes.disabled = false;
  confirmBox.hidden = true;
  say(resultText(result));
  if (!result.isError) form.reset();
});

await app.connect();
const context = app.getHostContext();
applyHost(context);
if (
  context?.availableDisplayModes?.includes("fullscreen") &&
  context.displayMode !== "fullscreen"
) {
  await app.requestDisplayMode({ mode: "fullscreen" }).catch(() => undefined);
}
