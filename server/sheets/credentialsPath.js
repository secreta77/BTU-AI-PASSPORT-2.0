// Finds the Google service-account key file. Pure helpers: the file check is passed in, so tests need no real files.
// Locally the key lives in server/credentials/. On Render it is a "Secret File": Render puts it in /etc/secrets/<name>
// (and, for non-Docker services, also in the service's root directory). The path in .env may not match that place,
// so after the configured path we also try the same file name in those two folders.
import fs from 'node:fs';
import path from 'node:path';

export const RENDER_SECRETS_DIR = '/etc/secrets';

// Places to look, in order, without repeats: the configured path first, then the same file name on Render
export function credentialsCandidates(configuredPath, { serverDir, secretsDir = RENDER_SECRETS_DIR, workingDir = process.cwd() }) {
  const fileName = path.basename(configuredPath);
  const all = [
    path.resolve(serverDir, configuredPath),
    path.join(secretsDir, fileName),
    path.join(workingDir, fileName),
  ];
  return all.filter((candidate, index) => all.indexOf(candidate) === index);
}

// { path } of the first candidate that is a file, or { path: null } with the list that was tried (for the error text)
export function resolveCredentialsPath(configuredPath, options, exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile()) {
  const tried = credentialsCandidates(configuredPath, options);
  const found = tried.find((candidate) => exists(candidate));
  return { path: found ?? null, tried };
}

// One clear sentence for the "file not found" case: what was looked for, where, and what to do
export function missingCredentialsMessage(tried) {
  const fileName = path.basename(tried[0]);
  return `Google key file not found. Looked in: ${tried.join(', ')}. `
    + `Locally: put the key at server/credentials/${fileName}. `
    + `On Render: add a Secret File named ${fileName} (it appears in ${RENDER_SECRETS_DIR}), `
    + 'or set GOOGLE_CREDENTIALS_PATH to the exact path.';
}
