import { strict as assert } from "node:assert";
import { hashAuthActionToken } from "./server.js";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890";
const hash = hashAuthActionToken(token);

assert.equal(hash.length, 64);
assert.notEqual(hash, token);
assert.throws(() => hashAuthActionToken("short"), /Invalid auth action token/);

console.log("Auth utility tests passed.");
