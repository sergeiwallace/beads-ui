// Pictures where a surface draws them (D-43, T-2C.13): the Timeline's picture as an Image of
// real pixels on a terminal that can show one, as an Svg on the desktop, VS Code and mobile
// surfaces, and as its alt text elsewhere. Pure: which form a surface draws, and each form.

import type { StatusCategory } from "../model.ts";
import type { Token } from "../tokens.ts";
import { base64, rasterColorFor } from "./raster.ts";
import { truncate } from "./text.ts";
import type { TimelineView } from "./timeline.ts";

/** What the terminal says of itself, from its environment, and inside tmux what tmux says. */
export interface TerminalFacts {
  term?: string;
  termProgram?: string;
  termProgramVersion?: string;
  /** Present inside tmux (TMUX is set): its allow-passthrough value and the terminal outside it. */
  tmux?: { passthrough?: string; clientTermtype?: string };
}

/** Whether the terminal draws an Image's pixels, and why. */
export interface ImageVerdict {
  images: boolean;
  reason: string;
}

const atLeast = (version: string | undefined, major: number, minor: number): boolean => {
  const match = /^(\d+)\.(\d+)/.exec(version ?? "");
  if (match === null) return false;
  const [have, sub] = [Number(match[1]), Number(match[2])];
  return have > major || (have === major && sub >= minor);
};

/** A terminal that draws pictures, as `TERM` and `TERM_PROGRAM` name it outside tmux. */
const drawsOutside = (facts: TerminalFacts): string | undefined => {
  if (facts.term === "xterm-kitty") return "kitty";
  if (facts.term === "xterm-ghostty" || facts.termProgram === "ghostty") return "Ghostty";
  if (facts.termProgram === "iTerm.app" && atLeast(facts.termProgramVersion, 3, 5)) {
    return "iTerm2 3.5 or later";
  }
  return undefined;
};

/** The terminal outside tmux, as `#{client_termtype}` names it, when it draws pictures. */
const drawsOuter = (termtype: string | undefined): string | undefined => {
  const name = termtype ?? "";
  if (/^kitty\b/i.test(name)) return "kitty";
  if (/^ghostty\b/i.test(name)) return "Ghostty";
  const iterm = /^iTerm2\s+(\S+)/.exec(name);
  if (iterm !== null && atLeast(iterm[1], 3, 5)) return "iTerm2 3.5 or later";
  return undefined;
};

/**
 * Whether the terminal can show an Image (Claude Code 2.1.310): kitty, Ghostty and iTerm2 3.5 or
 * later draw its pixels; inside tmux only with allow-passthrough on and one of those outside it.
 * Anything else, or a fact that could not be read, draws the alt text.
 */
export function terminalImages(facts: TerminalFacts): ImageVerdict {
  if (facts.tmux !== undefined) {
    const passthrough = facts.tmux.passthrough?.trim();
    if (passthrough !== "on" && passthrough !== "all") {
      return {
        images: false,
        reason: `tmux allow-passthrough is ${passthrough === undefined || passthrough === "" ? "unread" : passthrough}`,
      };
    }
    const outer = drawsOuter(facts.tmux.clientTermtype);
    if (outer === undefined) {
      return { images: false, reason: "the terminal outside tmux draws no pictures" };
    }
    if (outer.startsWith("iTerm2") && passthrough !== "on") {
      return { images: false, reason: "iTerm2 inside tmux needs allow-passthrough on, not all" };
    }
    return { images: true, reason: `${outer} through tmux` };
  }
  const here = drawsOutside(facts);
  return here === undefined
    ? { images: false, reason: "this terminal draws no pictures" }
    : { images: true, reason: here };
}

/** The form a picture takes on a surface. */
export type PictureForm = "image" | "svg" | "alt";

/** A picture's form: Image on a terminal that draws one, Svg off the terminal, else alt text. */
export const pictureForm = (
  surface: "terminal" | "desktop" | "vscode" | "mobile",
  terminalDrawsImages: boolean,
): PictureForm => (surface === "terminal" ? (terminalDrawsImages ? "image" : "alt") : "svg");

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const join = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** The most a stored deflate block holds. */
const STORED_MAX = 65_535;

/**
 * A 4-bit palette PNG of `pixels` (one palette index a pixel, row after row), palette entry 0
 * transparent, with its data in stored deflate blocks: no compressor is needed, and four bits a
 * pixel keep a picture small enough for the 100,000-character tree. At most 16 colours.
 */
export function palettePng(
  width: number,
  height: number,
  palette: readonly number[],
  pixels: Uint8Array,
): Uint8Array {
  const rowBytes = Math.ceil(width / 2);
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (rowBytes + 1);
    raw[at] = 0;
    for (let x = 0; x < width; x++) {
      const index = (pixels[y * width + x] ?? 0) & 0x0f;
      const byte = at + 1 + (x >> 1);
      raw[byte] = (raw[byte] ?? 0) | (x % 2 === 0 ? index << 4 : index);
    }
  }
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let at = 0; at < raw.length || at === 0; at += STORED_MAX) {
    const part = raw.subarray(at, Math.min(raw.length, at + STORED_MAX));
    const head = new Uint8Array(5);
    head[0] = at + STORED_MAX >= raw.length ? 1 : 0;
    head[1] = part.length & 0xff;
    head[2] = part.length >> 8;
    head[3] = ~part.length & 0xff;
    head[4] = (~part.length >> 8) & 0xff;
    blocks.push(head, part);
    if (raw.length === 0) break;
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, adler32(raw));
  blocks.push(adler);
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([4, 3, 0, 0, 0], 8);
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((rgb, i) => {
    plte.set([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff], i * 3);
  });
  const trns = new Uint8Array(palette.length).fill(255);
  trns[0] = 0;
  return join([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", join(blocks)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** The most dated items the Timeline's picture draws a bar for. */
export const PICTURE_MAX_ITEMS = 12;
/** Pixels a terminal cell is drawn as across and down, for the Image's own size. */
const CELL_PX = { x: 4, y: 8 } as const;
/** The Svg's own units a column takes; it scales to the width the surface gives it. */
const SVG_COLUMN_PX = 8;

export interface TimelinePicture {
  /** The rows and columns the picture takes, in cells. */
  columns: number;
  rows: number;
  /** The Image's source, a 4-bit palette PNG, base64. */
  png: string;
  /** The Svg's source: a viewBox drawn at the full width it is given. */
  svg: string;
  /** What the picture shows, drawn where it cannot be. */
  alt: string;
}

const CATEGORY_TOKEN: Readonly<Record<StatusCategory, Token>> = {
  active: "status.active",
  wip: "status.wip",
  frozen: "status.frozen",
  done: "status.done",
};

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, "0")}`;
const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The Timeline's picture (D-43): each dated epic or milestone, up to PICTURE_MAX_ITEMS, as a bar
 * from the axis start to its due date in its status colour, and a line at today when today is on
 * the axis; `columns` wide, a row of cells a bar up to six. Undefined with no dated item.
 */
export function timelinePicture(
  view: TimelineView,
  options: {
    columns: number;
    today?: string;
    overrides?: Readonly<Partial<Record<Token, string>>>;
  },
): TimelinePicture | undefined {
  const axis = view.axis;
  const items = view.items.slice(0, PICTURE_MAX_ITEMS);
  if (axis === undefined || items.length === 0) return undefined;
  const columns = Math.max(1, Math.min(512, Math.floor(options.columns)));
  const rows = Math.max(2, Math.min(6, items.length));
  const colour = (token: Token) => rasterColorFor(token, options.overrides);
  const todayDay =
    options.today === undefined ? undefined : Date.parse(options.today.slice(0, 10)) / 86_400_000;
  const startDay = Date.parse(axis.start) / 86_400_000;
  const endDay = Date.parse(axis.end) / 86_400_000;
  const span = endDay - startDay;
  const todayAt =
    todayDay === undefined || span <= 0 || todayDay < startDay || todayDay > endDay
      ? undefined
      : (todayDay - startDay) / span;

  // The Image: palette 0 transparent, 1 the today line, then one entry per category.
  const categories: StatusCategory[] = ["active", "wip", "frozen", "done"];
  const palette = [0, colour("accent"), ...categories.map((one) => colour(CATEGORY_TOKEN[one]))];
  const width = columns * CELL_PX.x;
  const height = rows * CELL_PX.y;
  const pixels = new Uint8Array(width * height);
  const band = height / items.length;
  items.forEach((item, i) => {
    const top = Math.floor(i * band + (band > 3 ? 1 : 0));
    const bottom = Math.max(top + 1, Math.floor((i + 1) * band - (band > 3 ? 1 : 0)));
    const right = Math.max(1, Math.round(item.position * width));
    const index = 2 + categories.indexOf(item.category);
    for (let y = top; y < Math.min(bottom, height); y++)
      pixels.fill(index, y * width, y * width + right);
  });
  if (todayAt !== undefined) {
    const x = Math.min(width - 1, Math.round(todayAt * (width - 1)));
    for (let y = 0; y < height; y++) pixels[y * width + x] = 1;
  }

  // The Svg: the same bars, each with its label and due date as its hover title.
  const svgWidth = columns * SVG_COLUMN_PX;
  const barHeight = 12;
  const svgHeight = items.length * (barHeight + 4);
  const rects = items
    .map((item, i) => {
      const w = Math.max(2, Math.round(item.position * svgWidth));
      const fill = hex(colour(CATEGORY_TOKEN[item.category]));
      const title = escapeXml(`${item.label} due ${item.due}`);
      return `<rect x="0" y="${i * (barHeight + 4)}" width="${w}" height="${barHeight}" rx="2" fill="${fill}"><title>${title}</title></rect>`;
    })
    .join("");
  const todayLine =
    todayAt === undefined
      ? ""
      : `<line x1="${Math.round(todayAt * svgWidth)}" y1="0" x2="${Math.round(todayAt * svgWidth)}" y2="${svgHeight}" stroke="${hex(colour("accent"))}" stroke-width="2"><title>today</title></line>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%"><style>rect:hover{opacity:.75}</style>${rects}${todayLine}</svg>`;

  const shown = view.items.length > items.length ? `the first ${items.length} of ` : "";
  const alt = truncate(
    `Picture: ${shown}${view.items.length} due ${axis.start} to ${axis.end}${todayAt === undefined || options.today === undefined ? "" : `, today ${options.today.slice(0, 10)}`}`,
    columns,
  );
  return {
    columns,
    rows,
    png: base64(palettePng(width, height, palette, pixels)),
    svg,
    alt,
  };
}
