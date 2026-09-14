import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { z } from "zod";

import { RECOGNIZED_SCOPES, type HostedConfig } from "./config.js";

export class HostedAuthorizationError extends Error {
  constructor(readonly status: 401 | 503) {
    super(
      status === 401
        ? "Invalid connector access token"
        : "Authorization service temporarily unavailable",
    );
  }
}

const claimsSchema = z.object({
  type: z.literal("mcp_access"),
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  client_id: z.string().url().max(2048),
  scope: z.string(),
  exp: z.number().int().positive(),
});
const scopeSchema = z.array(z.enum(RECOGNIZED_SCOPES)).min(1);

export type HostedIdentity = {
  readonly userId: string;
  readonly grantId: string;
  readonly clientId: string;
};
export type HostedTokenVerifier = (token: string) => Promise<HostedIdentity>;

export function createHostedTokenVerifier(
  config: HostedConfig,
): HostedTokenVerifier {
  const keys = createRemoteJWKSet(new URL(config.jwksUrl), {
    cacheMaxAge: 300_000,
    cooldownDuration: 30_000,
    timeoutDuration: 3_000,
  });
  return async (token) => {
    try {
      const result = await jwtVerify(token, keys, {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.resource,
        requiredClaims: ["exp", "iss", "aud", "sub", "jti"],
      });
      if (
        result.payload.aud !== config.resource ||
        typeof result.protectedHeader.kid !== "string"
      )
        throw new HostedAuthorizationError(401);
      const claims = claimsSchema.safeParse(result.payload);
      if (
        !claims.success ||
        !scopeSchema.safeParse(claims.data.scope.split(" ")).success
      )
        throw new HostedAuthorizationError(401);
      return {
        userId: claims.data.sub,
        grantId: claims.data.jti,
        clientId: claims.data.client_id,
      };
    } catch (error) {
      if (error instanceof HostedAuthorizationError) throw error;
      if (
        error instanceof errors.JWKSTimeout ||
        error instanceof errors.JWKSInvalid ||
        !(error instanceof errors.JOSEError)
      )
        throw new HostedAuthorizationError(503);
      // Discovery transport failures are availability failures, not evidence of invalid credentials.
      if (error.code === "ERR_JOSE_GENERIC")
        throw new HostedAuthorizationError(503);
      throw new HostedAuthorizationError(401);
    }
  };
}
