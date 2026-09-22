/**
 * Asks whether what is live is what is on `main`.
 *
 * Vercel deploys on a webhook from GitHub, and a webhook is a thing that can
 * be dropped. It was dropped once: PR #19 merged at 10:38 and no build was
 * ever queued for the merge commit, so the station kept Soap quiet and the
 * verdict silent for hours after the work had shipped. Nothing said so. The
 * two deploys either side of it had gone out fine, which is exactly what made
 * it invisible: the dashboard looked busy and healthy.
 *
 * So this compares one sha against one sha. What Vercel is serving as
 * production, against what `main` says should be there. It is not a health
 * check, it does not fetch a page, and it does not care whether the build was
 * good. It answers the narrow question nothing else was answering.
 *
 *   npm run check-deploy              # against origin/main, right now
 *   npm run check-deploy -- --wait=900  # poll for 15 min, for use after a push
 *   npm run check-deploy -- --sha=<sha> # against a specific commit
 *
 * Needs a Vercel token with read access to the project, as VERCEL_TOKEN.
 * Create one at https://vercel.com/account/tokens. The project and team ids
 * below are identifiers rather than credentials, so they sit here in the
 * open; only the token is a secret.
 */

import { execFileSync } from "node:child_process";

const API = "https://api.vercel.com";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_VuzxBBBq6FF6FoYCyuCjzUT3zvbb";
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_oslZcw7O6bGcVI3ft31QTrbe";

/** Seconds between polls while waiting on a build. */
const POLL_SECONDS = 20;

/** Reads `--name=value` off the command line. */
function flag(name) {
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/** Runs git and returns its output trimmed, or null if the command fails. */
function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

async function api(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Vercel ${response.status} on ${path}. ${body.slice(0, 300)}`);
  }
  return response.json();
}

/**
 * The commit Vercel is currently serving as production.
 *
 * The project's own `targets.production` is the honest answer, because it
 * follows a rollback: roll back and the newest ready deployment is no longer
 * the live one. The deployments list is the fallback for when that shape is
 * not there, and the caller is told which of the two answered so a surprising
 * result can be read properly.
 */
export async function liveProduction(token, fetchJson = api) {
  const project = await fetchJson(`/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`, token);
  const target = project?.targets?.production;
  if (target?.meta?.githubCommitSha) {
    return {
      sha: target.meta.githubCommitSha,
      id: target.id ?? null,
      source: "project target",
    };
  }

  const list = await fetchJson(
    `/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&target=production&state=READY&limit=1`,
    token,
  );
  const newest = list?.deployments?.[0];
  if (!newest?.meta?.githubCommitSha) return null;
  return {
    sha: newest.meta.githubCommitSha,
    id: newest.uid ?? newest.id ?? null,
    source: "newest ready deployment",
  };
}

/**
 * Whether `live` is an acceptable answer for `expected`.
 *
 * Equal is the ordinary pass. Ahead is also a pass: a later commit can land
 * while this is still polling, and production moving on to it is the system
 * working, not a miss. Ancestry needs both commits in the local clone, so a
 * shallow checkout cannot judge it and says so rather than guessing.
 */
export function verdict(expected, live) {
  if (!live) return { ok: false, why: "Vercel reports no production deployment at all." };
  if (live.sha === expected) return { ok: true, why: "live matches" };

  const known = git("cat-file", "-e", `${live.sha}^{commit}`) !== null;
  if (!known) {
    return {
      ok: false,
      why: `live is ${live.sha.slice(0, 7)}, which this clone does not have, so it cannot be ruled a later commit`,
    };
  }
  if (git("merge-base", "--is-ancestor", expected, live.sha) !== null) {
    return { ok: true, why: `live is ${live.sha.slice(0, 7)}, a later commit` };
  }
  return { ok: false, why: `live is ${live.sha.slice(0, 7)}, which is not ${expected.slice(0, 7)} or later` };
}

/** The commit production is expected to be serving. */
function expectedSha() {
  const asked = flag("sha");
  if (asked) return asked;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  git("fetch", "origin", "main", "--quiet");
  return git("rev-parse", "origin/main") || git("rev-parse", "HEAD");
}

export async function main({ fetchJson = api, sleep = wait } = {}) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.error(
      "VERCEL_TOKEN is not set, so nothing can be read from Vercel and this check cannot answer.\n" +
        "Create a read token at https://vercel.com/account/tokens, then export it locally or add\n" +
        "it as a repository secret named VERCEL_TOKEN for the workflow.",
    );
    process.exitCode = 1;
    return;
  }

  const expected = expectedSha();
  if (!expected) {
    console.error("Could not work out which commit to expect. Pass one with --sha=<sha>.");
    process.exitCode = 1;
    return;
  }

  const deadline = Date.now() + Number(flag("wait") || 0) * 1000;
  let last = null;

  for (;;) {
    const live = await liveProduction(token, fetchJson);
    last = verdict(expected, live);
    if (last.ok) {
      console.log(`Production is up to date: ${expected.slice(0, 7)} (${last.why}).`);
      return;
    }
    if (Date.now() >= deadline) break;
    console.log(`Not there yet: ${last.why}. Checking again in ${POLL_SECONDS}s.`);
    await sleep(POLL_SECONDS * 1000);
  }

  console.error(
    `Production is NOT serving ${expected.slice(0, 7)}.\n` +
      `  ${last.why}\n\n` +
      "If the commit is on main and no build exists for it, the deploy webhook was dropped.\n" +
      "Redeploy it from https://vercel.com/harry-mcgoverns-projects/galaxia (Deployments, then\n" +
      "Redeploy on the commit), and the site catches up in about a minute.",
  );
  process.exitCode = 1;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invoked) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
