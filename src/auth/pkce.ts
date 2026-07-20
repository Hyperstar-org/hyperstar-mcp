import { createHash, randomBytes } from "node:crypto";

export type PkcePair = {
  readonly verifier: string;
  readonly challenge: string;
};

/** Create a URL-safe PKCE verifier and its S256 challenge. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge };
}

/** Create a URL-safe OAuth state value. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}
