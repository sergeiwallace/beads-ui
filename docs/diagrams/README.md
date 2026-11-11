# README diagrams

The root README embeds a checked-in PNG so the roadmap is visible without a client-side
Mermaid renderer, including in mobile readers and Markdown-to-PDF workflows. The SVG provides
a scalable alternative; the DOT file is the editable source of truth.

Regenerate both images from the repository root with [Graphviz](https://graphviz.org/):

```sh
dot -Tsvg docs/diagrams/roadmap.dot -o docs/diagrams/roadmap.svg
dot -Tpng -Gdpi=144 docs/diagrams/roadmap.dot -o docs/diagrams/roadmap.png
```

The checked-in images use Graphviz 2.42.4 and DejaVu Sans. Other renderer or font versions can
change layout, so inspect regenerated images and the root README preview before merging.

Solid arrows show the shared foundation implemented in source. Dashed arrows show proposed
development directions, not current runtime connections or a guaranteed release sequence.
Keep that distinction consistent with the roadmap table when editing the diagram.
