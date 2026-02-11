/**
 * Expt IDL re-export.
 * Auto-generated from `anchor build` — do not edit manually.
 *
 * We use a JSON require + type assertion rather than `import ... from "*.json"`
 * so TypeScript doesn't widen the literal types in discriminated unions.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idlJson = require("./expt.json");

export const IDL = idlJson;
export type Expt = any;
