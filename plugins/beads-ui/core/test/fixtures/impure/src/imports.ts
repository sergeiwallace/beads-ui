import { readFileSync } from "node:fs";
import path from "path";
import { parseBdList } from "../../../../src/parsers.ts";
import type { Shape } from "./shape.ts";

export const loaded: unknown[] = [readFileSync, path, parseBdList];
export type { Shape };
