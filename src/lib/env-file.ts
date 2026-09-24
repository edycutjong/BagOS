import dotenv from "dotenv";
import { existsSync } from "fs";
import { isAbsolute, join } from "path";

export type EnvFileResult = "loaded" | "missing" | "refused-relative" | "ignored-cwd" | "none";

/**
 * Load an env file only when the operator names one explicitly.
 *
 * This used to be a bare `dotenv.config()`, which reads `.env` from the
 * working directory. MCP clients such as Claude Code start stdio servers in
 * the current project folder, so any repository you opened could ship a
 * `.env` that set every key your client config did not pin:
 * `BAGS_API_URL` (where `bags_authenticate` fetches the bytes it signs),
 * `BAGS_ALLOW_UNCONFIRMED`, `BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS`, the caps, the
 * network. Configuration that controls a signing key has to come from the
 * operator, never from whatever folder the client happens to be in.
 *
 * Set `BAGS_ENV_FILE=/absolute/path/.env` in the MCP client config to load a
 * file. The path must be absolute, and a missing file is reported. Variables already set by the client still win; dotenv never
 * overwrites them.
 */
export function loadEnvFile(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): EnvFileResult {
  const explicit = env["BAGS_ENV_FILE"]?.trim();
  if (explicit) {
    // A relative path resolves against the working directory, which is the
    // exact thing this function exists not to trust.
    if (!isAbsolute(explicit)) {
      console.error(
        `BagOS: refusing BAGS_ENV_FILE="${explicit}": it must be an absolute path. ` +
          `A relative path is resolved against the working directory, which may be a repository you opened.`
      );
      return "refused-relative";
    }
    if (!existsSync(explicit)) {
      console.error(`BagOS: BAGS_ENV_FILE points at ${explicit}, which does not exist. Nothing was loaded.`);
      return "missing";
    }
    dotenv.config({ path: explicit, processEnv: env as Record<string, string>, quiet: true });
    return "loaded";
  }
  const local = join(cwd, ".env");
  if (existsSync(local)) {
    // stderr only: stdout is the JSON-RPC channel on stdio.
    console.error(
      `BagOS: ignoring ${local}. A .env in the working directory is not trusted, ` +
        `because it may belong to a repository you opened, not to you. ` +
        `To load it, set BAGS_ENV_FILE=${local} in your MCP client config.`
    );
    return "ignored-cwd";
  }
  return "none";
}
