// Fixture for purity.spec.ts: each escape a string can build sits on a known line.
const target = "../outside";
export const computed = import(target);
export const joined = import("./" + "escapes.ts");
export const evaluated = eval("1 + 1");
export const called = Function("return process")();
export const constructed = new Function("return 1");
export const own = self;
export const keyed = globalThis["process"];
export const viaConstructor = (() => 0).constructor("return 1");
export const viaKey = [].map["constructor"];
export const literal = import("./escapes.ts");
export const withOptions = import("./escapes.ts", {});
