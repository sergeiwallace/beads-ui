# Security policy

## Reporting a vulnerability

Report a vulnerability privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. Do not open a public issue for it.

Say what is affected, how to reproduce it, and what an attacker could do with it.

## Supported versions

beads-ui is in early development and has no release yet. Fixes land on `main`.

## Scope

beads-ui reads and writes a local Beads store by running the `bd` command. The planned web app and
MCP server are designed to listen on loopback, with a hosted deployment behind authentication; a
report about a hosted deployment that skipped that step is a configuration issue, not a
vulnerability in beads-ui.

## Secrets in this repository

This repository is public and must hold no secrets. A gitleaks pre-commit hook scans every commit.
If you find a credential in the history, report it as above so it can be rotated.
