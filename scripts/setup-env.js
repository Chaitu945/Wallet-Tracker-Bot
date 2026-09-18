#!/usr/bin/env node
/**
 * Interactive .env setup.
 *
 * Prompts for the credentials the bot needs, validates their shape before
 * accepting them, and writes .env. Input is masked on a real terminal and values
 * are never echoed back, so nothing sensitive ends up in scrollback, logs, or a
 * chat transcript.
 *
 * Run it directly in your own terminal:
 *
 *   npm run setup
 *   npm run setup -- --force    # re-enter even the keys already set
 */

const fs = require("fs");
const path = require("path");
const { applicationIdFromToken } = require("../src/utils/discordIds");

const ENV_PATH = path.join(__dirname, "..", ".env");
const ENV_EXAMPLE = path.join(__dirname, "..", ".env.example");

/**
 * Expected value shapes. Bot tokens are ~70 chars in three dot-separated parts;
 * application IDs are 17-20 digits; Moralis keys ~64 chars; Alchemy keys ~32.
 * Ranges are wide enough to absorb format changes but narrow enough to catch the
 * two mistakes that actually happen: pasting a truncated key, and pasting the
 * key along with surrounding page text.
 */
const EXPECTED = {
  DISCORD_TOKEN: { min: 50, max: 120 },
  DISCORD_CLIENT_ID: { min: 17, max: 20 },
  MORALIS_API_KEY: { min: 24, max: 200 },
  ALCHEMY_API_KEY: { min: 24, max: 100 },
};

function lengthProblem(key, value) {
  const { min, max } = EXPECTED[key];
  if (value.length < min) {
    return `that is only ${value.length} characters; a real one is at least ${min}. It may be truncated — check you copied the whole value.`;
  }
  if (value.length > max) {
    return `that is ${value.length} characters; a real one is at most ${max}. It looks like more than the key got pasted (page text, a table row, or several keys at once).`;
  }
  return null;
}

function blobProblem(value) {
  if (/\s/.test(value)) {
    return "that contains whitespace — a key never does. It looks like a multi-word paste.";
  }
  if (/["']/.test(value)) {
    return "that contains quote characters — paste the raw value without quotes.";
  }
  return null;
}

/**
 * Each entry knows how to recognise a *wrong* value, which is the whole point:
 * pasting the placeholder text, the Client Secret, a truncated key, or a whole
 * page of text all fail loudly here instead of silently breaking the bot later.
 */
const FIELDS = [
  {
    key: "DISCORD_TOKEN",
    label: "Discord bot token",
    hint: "Developer Portal -> your app -> Bot -> Reset Token -> Copy",
    validate: (v) => {
      if (v.split(".").length !== 3) {
        return (
          "that has " +
          v.split(".").length +
          " dot-separated parts; a bot token has 3. Did you copy the Client Secret or the Public Key by mistake?"
        );
      }
      if (/^your_/.test(v)) return "that is still the placeholder text from .env.example.";
      return blobProblem(v) || lengthProblem("DISCORD_TOKEN", v);
    },
  },
  {
    key: "DISCORD_CLIENT_ID",
    label: "Discord application ID (optional — derived from the token if you skip it)",
    hint: "Developer Portal -> your app -> General Information -> Application ID. Press Enter to skip: the bot reads it from the token, which is authoritative.",
    optional: true,
    validate: (v, ctx) => {
      if (/^your_/.test(v)) return "that is still the placeholder text from .env.example.";
      if (!/^\d{17,20}$/.test(v)) return "an application ID is 17-20 digits, nothing else.";

      // A channel or guild id is also 17-20 digits, so shape alone cannot tell
      // them apart. The token can: it encodes the real application id, which is
      // how a pasted channel id produces "Unknown Application" at deploy time.
      const expected = ctx?.token ? applicationIdFromToken(ctx.token) : null;
      if (expected && v !== expected) {
        return `that is not the application your token belongs to (${expected}). It looks like a channel or guild id — those appear in URLs and have the same shape. Press Enter to skip this; the bot derives it from the token.`;
      }
      return null;
    },
  },
  {
    key: "MORALIS_API_KEY",
    label: "Moralis API key (EVM + Solana data)",
    hint: "moralis.com -> free account -> API Keys. Skip with Enter if you only need Robinhood Chain.",
    optional: true,
    validate: (v) => {
      if (/^your_/.test(v)) return "that is still the placeholder text from .env.example.";
      return blobProblem(v) || lengthProblem("MORALIS_API_KEY", v);
    },
  },
  {
    key: "ALCHEMY_API_KEY",
    label: "Alchemy API key (Robinhood Chain data)",
    hint: "dashboard.alchemy.com -> Apps -> your app -> API Key. Skip with Enter if you don't track Robinhood Chain.",
    optional: true,
    validate: (v) => {
      if (/^your_/.test(v)) return "that is still the placeholder text from .env.example.";
      return blobProblem(v) || lengthProblem("ALCHEMY_API_KEY", v);
    },
  },
];

const PLACEHOLDER_RE = /^your_/;

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(ENV_EXAMPLE)) {
      fs.copyFileSync(ENV_EXAMPLE, ENV_PATH);
      console.log(".env did not exist — created it from .env.example.\n");
    } else {
      fs.writeFileSync(ENV_PATH, "");
      console.log(".env did not exist — created an empty one.\n");
    }
  }

  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) values[m[1]] = m[2];
  }
  return { lines, values };
}

function writeEnvFile(lines, updates) {
  const remaining = { ...updates };
  const out = [];

  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && Object.prototype.hasOwnProperty.call(remaining, m[1])) {
      out.push(`${m[1]}=${remaining[m[1]]}`);
      delete remaining[m[1]];
    } else {
      out.push(line);
    }
  }

  for (const [key, value] of Object.entries(remaining)) {
    out.push(`${key}=${value}`);
  }

  // Collapse trailing blank lines, keep exactly one final newline.
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  fs.writeFileSync(ENV_PATH, out.join("\n") + "\n");
  fs.chmodSync(ENV_PATH, 0o600);
}

/**
 * Masked prompt on a real terminal; falls back to plain line reading when stdin
 * is a pipe so the script stays scriptable.
 *
 * The piped path queues lines rather than attaching a one-shot listener per
 * prompt. readline emits every buffered line as it parses, so a listener
 * attached only at prompt time misses lines that arrived in between — which is
 * exactly the case when input is piped in all at once.
 */
let pipedReader = null;
const pipedQueue = [];
let pipedWaiter = null;

function ensurePipedReader() {
  if (pipedReader) return;
  pipedReader = require("node:readline").createInterface({ input: process.stdin });
  pipedReader.on("line", (line) => {
    const value = line.trim();
    if (pipedWaiter) {
      const resolve = pipedWaiter;
      pipedWaiter = null;
      resolve(value);
    } else {
      pipedQueue.push(value);
    }
  });
  pipedReader.on("close", () => {
    if (pipedWaiter) {
      const resolve = pipedWaiter;
      pipedWaiter = null;
      resolve("");
    }
  });
}

function ask(prompt) {
  if (!process.stdin.isTTY) {
    ensurePipedReader();
    process.stdout.write(prompt);
    if (pipedQueue.length) return Promise.resolve(pipedQueue.shift());
    return new Promise((resolve) => {
      pipedWaiter = resolve;
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let buf = "";

    const finish = (value) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\n" || char === "\r") return finish(buf.trim());
        if (char === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") buf = buf.slice(0, -1);
        else if (char >= " ") buf += char;
      }
    };

    stdin.on("data", onData);
  });
}

function closeReader() {
  if (pipedReader) {
    pipedReader.close();
    pipedReader = null;
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const { lines, values } = readEnvFile();

  console.log("Hermes wallet-tracker-bot — .env setup");
  console.log("Values are masked and never echoed. Ctrl+C to abort.\n");

  const updates = {};

  // Validators may need the token (to cross-check the application id). It is
  // resolved lazily so it reflects a token entered earlier in this same run.
  const ctx = {
    get token() {
      return (updates.DISCORD_TOKEN || values.DISCORD_TOKEN || "").trim();
    },
  };

  for (const field of FIELDS) {
    const current = (values[field.key] || "").trim();
    const isPlaceholder = !current || PLACEHOLDER_RE.test(current);

    // An existing value is only left alone if it actually passes validation.
    // Skipping every set-but-unvalidated value would let a truncated key or a
    // paste accident sit in .env indefinitely, which is the exact failure this
    // script exists to prevent.
    if (!isPlaceholder && !force) {
      const existingProblem = field.validate(current, ctx);
      if (!existingProblem) {
        console.log(`  ${field.key} — set (${current.length} chars) and looks valid, keeping it.`);
        continue;
      }
      console.log(`\n${field.label}`);
      console.log(`  ${field.key} is set (${current.length} chars) but looks wrong:`);
      console.log(`    ${existingProblem}`);
    } else {
      const status = current ? "currently the placeholder" : "currently empty";
      console.log(`\n${field.label}`);
      console.log(`  ${field.key} is ${status}.`);
    }
    console.log(`  Where to get it: ${field.hint}`);

    // Bounded retries so a typo doesn't mean re-running the whole script.
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = await ask("  Paste it (or Enter to skip): ");
      if (!answer) {
        console.log("  skipped.");
        break;
      }
      const problem = field.validate(answer, ctx);
      if (!problem) {
        updates[field.key] = answer;
        console.log(`  accepted (${answer.length} chars).`);
        break;
      }
      console.log(`  that doesn't look right: ${problem}`);
      if (attempt === 2) console.log("  giving up on this one — re-run when ready.");
    }
  }

  // A value can end the run still invalid — the user skipped it, or ran out of
  // attempts — and a headline of "Nothing to write" would read as success while
  // a wrong value sits in .env. Report the state in every path.
  function reportState() {
    const stillInvalid = FIELDS.map((f) => {
      const value = (updates[f.key] || values[f.key] || "").trim();
      if (!value || PLACEHOLDER_RE.test(value)) return null;
      const problem = f.validate(value, ctx);
      return problem ? { key: f.key, problem } : null;
    }).filter(Boolean);

    if (stillInvalid.length) {
      console.log("");
      for (const { key, problem } of stillInvalid) {
        console.log(`  ${key} is still set to a value that looks wrong and will be ignored:`);
        console.log(`    ${problem}`);
      }
    }

    const stillMissing = FIELDS.filter((f) => {
      const v = (updates[f.key] || values[f.key] || "").trim();
      return (!v || PLACEHOLDER_RE.test(v)) && !f.optional;
    });
    if (stillMissing.length) {
      console.log(`Still required: ${stillMissing.map((f) => f.key).join(", ")}`);
    } else if (!stillInvalid.length) {
      console.log("\nNext:  npm run deploy-commands   then   npm start");
    }
  }

  if (Object.keys(updates).length === 0) {
    console.log("\nNothing to write. .env unchanged on disk.");
    reportState();
    closeReader();
    return;
  }

  writeEnvFile(lines, updates);
  console.log(`\nWrote ${Object.keys(updates).length} value(s) to .env (permissions set to owner-only).`);
  reportState();

  closeReader();
}

main().catch((err) => {
  console.error(`\nsetup failed: ${err.message}`);
  process.exit(1);
});
