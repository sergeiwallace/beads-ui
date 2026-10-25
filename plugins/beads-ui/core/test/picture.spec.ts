import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { palettePng } from "../src/index.ts";

// T-2C.13: the Timeline's Image is a PNG the core writes with no compressor. A terminal drawing
// it reads it with a real decoder, so this suite reads it with Node's zlib: each chunk's CRC,
// the header, and the pixels back.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Each chunk's type, data and whether its CRC matches. */
function chunksOf(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: { type: string; data: Uint8Array; crcOk: boolean }[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    const crc = view.getUint32(at + 8 + length);
    out.push({ type, data, crcOk: crc === crc32(png.subarray(at + 4, at + 8 + length)) });
    at += 12 + length;
  }
  return out;
}

describe("the Timeline picture's PNG (T-2C.13)", () => {
  it("should decode with zlib to the palette indices it was given, every chunk's CRC matching", () => {
    const width = 5;
    const height = 3;
    const pixels = Uint8Array.from({ length: width * height }, (_, i) => i % 4);
    const png = palettePng(width, height, [0, 0xff0000, 0x00ff00, 0x0000ff], pixels);

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = chunksOf(png);
    expect(chunks.map((one) => one.type)).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
    expect(chunks.every((one) => one.crcOk)).toBe(true);
    const header = new DataView(
      chunks[0]?.data.buffer ?? new ArrayBuffer(0),
      chunks[0]?.data.byteOffset,
    );
    expect([header.getUint32(0), header.getUint32(4)]).toEqual([width, height]);
    expect([...(chunks[0]?.data.subarray(8) ?? [])]).toEqual([4, 3, 0, 0, 0]);
    expect([...(chunks[2]?.data ?? [])]).toEqual([0, 255, 255, 255]);

    const raw = inflateSync(chunks[3]?.data ?? new Uint8Array(0));
    const rowBytes = Math.ceil(width / 2);
    const back: number[] = [];
    for (let y = 0; y < height; y++) {
      expect(raw[y * (rowBytes + 1)]).toBe(0);
      for (let x = 0; x < width; x++) {
        const byte = raw[y * (rowBytes + 1) + 1 + (x >> 1)] ?? 0;
        back.push(x % 2 === 0 ? byte >> 4 : byte & 0x0f);
      }
    }
    expect(back).toEqual([...pixels]);
  });

  it("should split pixel data past one stored block's 65,535 bytes into several blocks zlib reads back", () => {
    const width = 600;
    const height = 240;
    const pixels = new Uint8Array(width * height).fill(1);
    const png = palettePng(width, height, [0, 0x123456], pixels);

    const idat = chunksOf(png).find((one) => one.type === "IDAT")?.data ?? new Uint8Array(0);
    const raw = inflateSync(idat);
    expect(raw.length).toBe(height * (width / 2 + 1));
    expect(raw[1]).toBe(0x11);
  });
});
