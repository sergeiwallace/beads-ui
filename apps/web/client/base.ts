/**
 * The path the app is mounted under, as the server wrote it into the shell's `<base>`: `/`, or
 * `/beads/` behind app-portal. Every route and API URL the page makes starts with it.
 */
export const base: string = document.querySelector("base")?.getAttribute("href") ?? "/";
