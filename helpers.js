const dotenv = require('dotenv');
dotenv.config();

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

// Initialize the GitHub API client
const github = require('@actions/github');
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

function getPackageJson (workspace) {
  const pathToPackage = path.join(workspace, 'package.json');
  console.log(`Reading package.json from ${pathToPackage} ...`);
  if (!existsSync(pathToPackage)) throw new Error('package.json could not be found in your project\'s root.');
  return require(pathToPackage);
}

/**
   * @typedef {Object} Commit Commit object returned from GitHub API.
   * Documentation incomplete.
   * @property {Object} author describing the author of the commit
   * @property {String} author.name name of author
   * @property {String} author.email email of author
   * @property {Object} committer describing the committer of the commit
   * @property {String} committer.name name of committer
   * @property {String} committer.email email of committer
   * @property {String} message commit message
   */

/**
   * This returns all commits since now-hours until now.
   *
   * @param {Number} hours hours to go back from now
   * @returns {Commit[]|null} array of commits or null if no commits were found
   */
async function getCommitsSinceHours (hours) {
  const since = subtractHours(hours);
  console.log(`Getting commits for repo ${process.env.GITHUB_REPOSITORY} since ${since.toISOString()} until now (${new Date().toISOString()}) from GitHub API ...`);
  const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY.split('/');
  const response = await octokit.request('GET /repos/{owner}/{repo}/commits?since={since}', {
    repo: GITHUB_REPOSITORY[1],
    owner: GITHUB_REPOSITORY[0],
    since: since.toISOString()
  });
  if (response.data.length === 0) return null;
  return response.data.map(i => i.commit);
}

function subtractHours (numOfHours, date = new Date()) {
  date.setHours(date.getHours() - numOfHours);

  return date;
}

/**
 * Check against the user defined bump-policy whether a CI version bump already was done.
 *
 * @param {Commit[]} commits array of commits
 * @param {RegExp} commitMsgRegex regular expression for the bump commit messahe
 * @returns {Boolean} whether a bump already was done
 */
function checkForPreviousVersionBump (commits, commitMsgRegex) {
  const BUMP_POLICY = process.env['INPUT_BUMP-POLICY'];
  const commitMessages = commits ? commits.map((commit) => commit.message) : [];
  let isVersionBump = false;
  switch (BUMP_POLICY) {
    case 'last-commit':
      console.log('Checking for CI version bump in the last commit ...');
      isVersionBump = commitMessages.length > 0 && commitMsgRegex.test(commitMessages[commitMessages.length - 1]);
      break;
    case 'ignore':
      console.log('Ignoring any version bumps in commits...');
      break;
    default:
      console.log('Checking for CI version bump in all previous commits ...');
      isVersionBump = commitMessages.some((commitMsg) => commitMsgRegex.test(commitMsg));
      break;
  }
  console.info(`Found a previous version bump: ${isVersionBump}`);
  return isVersionBump;
}

/**
 * Get the version action to use.
 *
 * @param {Commit[]} commits array of commits
 * @returns {String|null} version action to use or null if no action found
 */
function getVersionAction (commits) {
  const commitMessages = commits ? commits.map(commit => commit.message + (commit.body ? ' | ' + commit.body : '')).join('\n - ') : '';
  // Input wordings for MAJOR, MINOR, PATCH, PRE-RELEASE
  const MAJOR_WORDS = process.env['INPUT_MAJOR-WORDING'].split(',');
  const MINOR_WORDS = process.env['INPUT_MINOR-WORDING'].split(',');
  // Patch is by default empty, and '' would always be true in the includes(''), thats why we handle it separately
  const PATCH_WORDS = process.env['INPUT_PATCH-WORDING'] ? process.env['INPUT_PATCH-WORDING'].split(',') : null;
  const PRELEASE_WORDS = process.env['INPUT_RC-WORDING'] ? process.env['INPUT_RC-WORDING'].split(',') : null;
  console.log(`Config words: { ${MAJOR_WORDS} | ${MINOR_WORDS} | ${PATCH_WORDS} | ${PRELEASE_WORDS} }`);

  /**
   * Version bump to use, default to user set default.
   */
  let version = process.env.INPUT_DEFAULT || 'patch';
  const PREID = process.env.INPUT_PREID || 'pre';

  // Check commit messages for input wordings
  if (MAJOR_WORDS.some((word) => commitMessages.includes(word))) {
    version = 'major';
  } else if (MINOR_WORDS.some((word) => commitMessages.includes(word))) {
    version = 'minor';
  } else if (PATCH_WORDS && PATCH_WORDS.some((word) => commitMessages.includes(word))) {
    version = 'patch';
  } else if (PRELEASE_WORDS && PRELEASE_WORDS.some((word) => commitMessages.includes(word))) {
    version = 'prerelease';
  }
  if (version === 'prerelease' && PREID) {
    version = `${version} --preid=${PREID}`;
  }
  console.log(`Version action to use is: ${version}`);
  return version;
}

function exitSuccess (message) {
  console.info(`✔ Success: ${message}`);
  process.exit(0);
}

function exitFailure (message) {
  logError(message);
  process.exit(1);
}

function logError (error) {
  console.error(`✖ Fatal: ${error.stack || error}`);
}

function runInWorkspace (workspace, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace });
    let isDone = false;
    const errorMessages = [];
    child.on('error', (error) => {
      if (!isDone) {
        isDone = true;
        reject(error);
      }
    });
    child.stderr.on('data', (chunk) => errorMessages.push(chunk));
    child.on('exit', (code) => {
      if (!isDone) {
        if (code === 0) {
          resolve();
        } else {
          reject(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`); // eslint-disable-line prefer-promise-reject-errors, no-undef
        }
      }
    });
  });
}

module.exports = {
  getPackageJson,
  getCommitsSinceHours,
  getVersionAction,
  checkForPreviousVersionBump,
  exitSuccess,
  exitFailure,
  runInWorkspace
};
