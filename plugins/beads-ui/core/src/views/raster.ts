// A Raster's cells (T-2B.9): each cell a code point, a foreground and a background,
// three little-endian 32-bit numbers, the whole grid base64, as Claude Code's Raster reads them.

import type { Token } from "../tokens.ts";

/** A Raster cell's colour for the terminal's own default. */
export const RASTER_DEFAULT_COLOR = 0x01000000;

/** The bytes of one cell. */
export const RASTER_CELL_BYTES = 12;

export interface RasterCell {
  codePoint: number;
  /** 0xRRGGBB, or RASTER_DEFAULT_COLOR. */
  color: number;
  background: number;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] ?? "";
    out += B64[(n >> 12) & 63] ?? "";
    out += i + 1 < bytes.length ? (B64[(n >> 6) & 63] ?? "") : "=";
    out += i + 2 < bytes.length ? (B64[n & 63] ?? "") : "=";
  }
  return out;
}

/** `cells`, row after row, as a Raster's `cells` prop. */
export function rasterCells(cells: readonly RasterCell[]): string {
  const bytes = new Uint8Array(cells.length * RASTER_CELL_BYTES);
  const view = new DataView(bytes.buffer);
  cells.forEach((cell, i) => {
    view.setUint32(i * RASTER_CELL_BYTES, cell.codePoint, true);
    view.setUint32(i * RASTER_CELL_BYTES + 4, cell.color, true);
    view.setUint32(i * RASTER_CELL_BYTES + 8, cell.background, true);
  });
  return base64(bytes);
}

/** A Raster's `cells` read back: what the tests and the design doc's captures draw. */
export function decodeRasterCells(cells: string): RasterCell[] {
  const clean = cells.replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const at = B64.indexOf(char);
    if (at < 0) continue;
    value = (value << 6) | at;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  const data = new DataView(new Uint8Array(bytes).buffer);
  const out: RasterCell[] = [];
  for (let i = 0; i + RASTER_CELL_BYTES <= bytes.length; i += RASTER_CELL_BYTES) {
    out.push({
      codePoint: data.getUint32(i, true),
      color: data.getUint32(i + 4, true),
      background: data.getUint32(i + 8, true),
    });
  }
  return out;
}

/**
 * Each token a Raster or a picture draws, as 0xRRGGBB. A Raster cell takes a 24-bit colour, not
 * a theme key, so these are mid values that read on a light and a dark background, the
 * Timeline's bar colours (T-2B.9) among them; `[theme]` sets any of them (rasterColorFor).
 */
export const RASTER_TOKEN_COLORS: Readonly<Partial<Record<Token, number>>> = {
  "status.active": 0x5f87d7,
  "status.wip": 0xd7875f,
  "status.frozen": 0x8a8a8a,
  "status.done": 0x5faf5f,
  warning: 0xd7af00,
  accent: 0xd7875f,
  "text.dim": 0x585858,
};

/** The colour of a cell past a bar's end. */
export const RASTER_TRACK_COLOR = 0x585858;

/** `#rgb` or `#rrggbb` as 0xRRGGBB; undefined for anything else. */
export function hexColor(hex: string): number | undefined {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short !== null) {
    return Number.parseInt(
      `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`,
      16,
    );
  }
  const long = /^#([0-9a-f]{6})$/i.exec(hex);
  return long === null ? undefined : Number.parseInt(long[1] ?? "", 16);
}

/** The 24-bit colour of `token`: its `[theme]` hex value when set, else RASTER_TOKEN_COLORS'. */
export function rasterColorFor(
  token: Token,
  overrides: Readonly<Partial<Record<Token, string>>> = {},
): number {
  const set = overrides[token];
  const parsed = set === undefined ? undefined : hexColor(set);
  return parsed ?? RASTER_TOKEN_COLORS[token] ?? RASTER_TRACK_COLOR;
}
