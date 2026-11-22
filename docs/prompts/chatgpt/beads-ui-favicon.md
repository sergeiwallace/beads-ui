# Beads UI browser icon: design and handoff

You are collaborating with Sergei on the Beads UI web app. Create a distinctive,
legible browser-tab icon, using the strongest available image-generation tools.
Work on the draft PR containing this document and inspect the current repository
and its existing visual identity before proposing a design.

## What to design

Beads UI is a task manager for Beads, used by people coordinating AI-assisted
work. Start by examining `apps/web/client/public/icon.svg`, the web manifest,
the README and any other current branding. The current web shell links the
manifest but does not explicitly link a favicon; the existing SVG contains three
colored beads. Treat that as context, not an instruction to preserve it unchanged.
Explore an appropriate visual direction with Sergei. The result should read at
16–32 pixels, work on light and dark browser tabs, and remain recognizable at
larger sizes. Avoid tiny lettering, fine detail, and third-party marks.

Generate and show Sergei suitable candidates. Iterate in chat until he explicitly
approves one. Do not treat a generated image or a draft PR as approval.

## After Sergei approves

Update this PR's branch with the approved source and suitable web assets. Wire
the favicon into the app so it works both at the root and under the `/beads/`
Tailscale mount. Inspect the build and server routing before choosing paths; keep
the existing manifest and installed-app behavior coherent. Use formats and sizes
that browsers can actually consume, and retain an editable source where practical.
Add focused tests or checks for the shipped asset and base-path references, and
report what was validated. Do not deploy or merge: Cole will review, test, merge,
and reload the service after Sergei returns.

If your ChatGPT session cannot access or update the GitHub branch, say so and
provide the approved asset and exact integration instructions to Sergei rather
than claiming a repository change occurred.
