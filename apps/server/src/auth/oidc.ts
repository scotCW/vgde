import * as client from "openid-client";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import type { Env } from "../env.js";
import { createAuthSession } from "./session.js";

const OIDC_FLOW_COOKIE = "vg_oidc_flow";

let cachedConfig: client.Configuration | null = null;

async function getConfig(env: Env): Promise<client.Configuration> {
  if (cachedConfig) return cachedConfig;
  if (!env.OIDC_ISSUER_URL || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) {
    throw new Error("OIDC is not configured");
  }
  cachedConfig = await client.discovery(
    new URL(env.OIDC_ISSUER_URL),
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  );
  return cachedConfig;
}

/** Redirects the browser to the IdP's authorization endpoint. */
export async function startOidcLogin(request: FastifyRequest, reply: FastifyReply, env: Env) {
  const config = await getConfig(env);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: env.OIDC_REDIRECT_URI!,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  reply.setCookie(OIDC_FLOW_COOKIE, JSON.stringify({ codeVerifier, state }), {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax", // must survive the redirect back from the IdP
    path: "/",
    maxAge: 600,
    signed: true,
  });

  return reply.redirect(authorizationUrl.toString());
}

/**
 * Handles the IdP's redirect back. Matches an existing OidcIdentity by
 * (issuer, subject); otherwise links by verified email if a local account
 * already uses it; otherwise auto-provisions a brand-new account.
 */
export async function handleOidcCallback(request: FastifyRequest, reply: FastifyReply, env: Env) {
  const config = await getConfig(env);
  const flowCookie = request.cookies[OIDC_FLOW_COOKIE];
  if (!flowCookie) {
    return reply.code(400).send({ error: "OIDC_FLOW_EXPIRED" });
  }
  const unsigned = request.unsignCookie(flowCookie);
  if (!unsigned.valid || !unsigned.value) {
    return reply.code(400).send({ error: "OIDC_FLOW_INVALID" });
  }
  const { codeVerifier, state } = JSON.parse(unsigned.value) as {
    codeVerifier: string;
    state: string;
  };
  reply.clearCookie(OIDC_FLOW_COOKIE, { path: "/" });

  const currentUrl = new URL(request.url, env.OIDC_REDIRECT_URI);
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
  });
  const claims = tokens.claims();
  if (!claims) {
    return reply.code(400).send({ error: "OIDC_NO_CLAIMS" });
  }
  const issuer = config.serverMetadata().issuer;
  const subject = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;
  const emailVerified = claims.email_verified !== false; // treat unset as trusted
  const name = typeof claims.name === "string" ? claims.name : null;

  const existingIdentity = await prisma.oidcIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    include: { user: true },
  });

  let userId: string;
  if (existingIdentity) {
    userId = existingIdentity.userId;
  } else {
    const existingUser =
      email && emailVerified ? await prisma.user.findUnique({ where: { email } }) : null;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const created = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: email && emailVerified ? email : null,
          displayNameDefault: name ?? email?.split("@")[0] ?? "Player",
        },
      });
      userId = created.id;
    }

    await prisma.oidcIdentity.create({
      data: { id: randomUUID(), userId, issuer, subject },
    });
  }

  await createAuthSession(reply, env, userId);
  return reply.redirect("/");
}
