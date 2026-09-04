import { z } from "zod";

// .env files commonly leave unset optional vars as `KEY=` (empty string)
// rather than omitting the line entirely; treat that the same as unset
// instead of failing validation on it (e.g. z.string().url().optional()
// would otherwise reject "").
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Signs the session cookie; also used as the argon2 pepper input salt seed.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Comma-separated list of origins allowed to call the API / open the WS.
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  // OIDC is optional: unset OIDC_ISSUER_URL disables the /auth/oidc routes.
  OIDC_ISSUER_URL: optional(z.string().url()),
  OIDC_CLIENT_ID: optional(z.string()),
  OIDC_CLIENT_SECRET: optional(z.string()),
  OIDC_REDIRECT_URI: optional(z.string().url()),

  // "oidc_only" removes /auth/register and /auth/login entirely (existing
  // password accounts included — this is a hard cutover, not a soft
  // preference) and hides the local-login form. Validated against OIDC
  // actually being configured below, so this can't lock everyone out.
  AUTH_MODE: z.enum(["password_and_oidc", "oidc_only"]).default("password_and_oidc"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.AUTH_MODE === "oidc_only" && !oidcEnabled(env)) {
    throw new Error(
      "AUTH_MODE=oidc_only requires OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and " +
        "OIDC_REDIRECT_URI to all be set — otherwise there would be no way to log in at all.",
    );
  }
  return env;
}

export function oidcEnabled(env: Env): boolean {
  return Boolean(
    env.OIDC_ISSUER_URL && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URI,
  );
}

export function passwordLoginEnabled(env: Env): boolean {
  return env.AUTH_MODE !== "oidc_only";
}
