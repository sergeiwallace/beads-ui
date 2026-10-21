// Fixture for purity.spec.ts: every banned reference sits on a known line.
// A comment naming window, document or setTimeout is not a reference.
const label = "the document title and the window size";
export function schedule(fn: () => void): void {
  setTimeout(fn, 10);
  setInterval(fn, 10);
  queueMicrotask(fn);
  requestAnimationFrame(fn);
}
export const width = window.innerWidth;
export const title = document.title;
export const env = process.env.HOME;
export const shown = `${label} ${globalThis.setTimeout}`;
console.log(label);
