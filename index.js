const dotenv = require('dotenv');
dotenv.config();

const { execSync } = require('child_process');
const helpers = require('./helpers');

// Change the working directory if user defined a PACKAGEJSON_DIR
if (process.env['INPUT_PACKAGE-JSON-DIR']) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env['INPUT_PACKAGE-JSON-DIR']}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}
const workspace = process.env.GITHUB_WORKSPACE;

// Main function
(async () => {
  console.log('::set-output name=bumped::false');

  const event = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {};
  // Populate the commits of the event from the GitHub API if user defined hours-to-go-back
  if (process.env['INPUT_HOURS-TO-GO-BACK']) {
    event.commits = await helpers.getCommitsSinceHours(process.env['INPUT_HOURS-TO-GO-BACK']);
  }
  // console.info(`Got ${event.commits.length} commit(s) with message(s):\n${event.commits.map((commit) => commit.message).join('\n')}`);
  // Check whether any commits happened
  if (!event.commits) {
    if (process.env['INPUT_SKIP-IF-NO-COMMITS'] === 'true') {
      helpers.exitSuccess('No action necassary because we found no commits!');
    } else {
      console.log('Couldn\'t find any commits in this event, incrementing patch version...');
    }
  }

  const TAG_PREFIX = process.env['INPUT_TAG-PREFIX'] || '';

  /**
   * Message to use when creating a bump commit.
   */
  const COMMITTING_MSG = process.env['INPUT_COMMIT-MESSAGE'] || 'ci: version bump to {{version}}';
  const COMMITTING_MSG_REGEX = new RegExp(COMMITTING_MSG.replace(/{{version}}/g, `${TAG_PREFIX}\\d+\\.\\d+\\.\\d+`), 'ig');

  // Check whether a version bump already has happened.
  const isVersionBump = helpers.checkForPreviousVersionBump(event.commits, COMMITTING_MSG_REGEX);
  if (isVersionBump === true) {
    helpers.exitSuccess('No action necessary because we found a previous bump!');
  }

  // Get the version action to use.
  const version = helpers.getVersionAction(event.commits);
  if (!version) helpers.exitSuccess('No version keywords found, skipping bump.');

  // git logic
  try {
    console.info('\nPerforming version bump ...');
    const pkg = helpers.getPackageJson(workspace);
    const current = pkg.version.toString();
    // Setup git user (not in development)
    if (process.env.NODE_ENV !== 'development') {
      await helpers.runInWorkspace(workspace, 'git', ['config', 'user.name', `"${process.env.GITHUB_USER || 'Automated Version Bump'}"`]);
      await helpers.runInWorkspace(workspace, 'git', [
        'config',
        'user.email',
        `"${process.env.GITHUB_EMAIL || 'gh-action-bump-version@users.noreply.github.com'}"`
      ]);
    }

    const refsRegExResult = /refs\/[a-zA-Z]+\/(.*)/.exec(process.env.GITHUB_REF);
    let currentBranch = refsRegExResult ? refsRegExResult[1] : undefined;
    let isPullRequest = false;
    if (process.env.GITHUB_HEAD_REF) {
      // Comes from a pull request
      currentBranch = process.env.GITHUB_HEAD_REF;
      isPullRequest = true;
    }
    if (process.env['INPUT_TARGET-BRANCH']) {
      // We want to override the branch that we are pulling / pushing to
      currentBranch = process.env['INPUT_TARGET-BRANCH'];
    }
    console.log('currentBranch: ', currentBranch);

    if (!currentBranch) {
      helpers.exitFailure('No branch found');
      return;
    }

    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await helpers.runInWorkspace(workspace, 'npm', ['version', '--allow-same-version=true', '--git-tag-version=false', current]);
    console.log('current 1: ', current, '/', 'version:', version);
    let newVersion = execSync(`npm version --git-tag-version=false ${version}`).toString().trim().replace(/^v/, '');
    console.log('newVersion 1: ', newVersion);
    newVersion = `${TAG_PREFIX}${newVersion}`;
    if (process.env.NODE_ENV !== 'development') {
      console.info('Committing version bump ...');
      await helpers.runInWorkspace(workspace, 'git', ['commit', '-a', '-m', COMMITTING_MSG.replace(/{{version}}/g, newVersion)]);
    }

    // now go to the actual branch to perform the same versioning
    if (isPullRequest) {
      // First fetch to get updated local version of branch
      await helpers.runInWorkspace(workspace, 'git', ['fetch']);
    }
    await helpers.runInWorkspace(workspace, 'git', ['checkout', currentBranch]);
    await helpers.runInWorkspace(workspace, 'npm', ['version', '--allow-same-version=true', '--git-tag-version=false', current]);
    console.log('current 2: ', current, '/', 'version:', version);
    console.log('execute npm version now with the new version: ', version);
    newVersion = execSync(`npm version --git-tag-version=false ${version}`).toString().trim().replace(/^v/, '');
    // fix #166 - npm workspaces
    // https://github.com/phips28/gh-action-bump-version/issues/166#issuecomment-1142640018
    newVersion = newVersion.split(/\n/)[1] || newVersion;
    console.log('newVersion 2: ', newVersion);
    console.log(`::set-output name=newVersion::${newVersion}`);
    const newTag = `${TAG_PREFIX}${newVersion}`;
    console.log(`newTag after merging tagPrefix+newVersion: ${newTag}`);

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    if (process.env.NODE_ENV !== 'development' && process.env['INPUT_SKIP-TAG'] !== 'true') {
      console.info('Tagging version bump commit ...');
      await helpers.runInWorkspace(workspace, 'git', ['tag', newTag]);
      console.info('Pushing version bump commit and tag ...');
      await helpers.runInWorkspace(workspace, 'git', ['push', remoteRepo, '--follow-tags']);
      await helpers.runInWorkspace(workspace, 'git', ['push', remoteRepo, '--tags']);
    } else if (process.env.NODE_ENV !== 'development') {
      console.info('Pushing version bump commit ...');
      await helpers.runInWorkspace(workspace, 'git', ['push', remoteRepo]);
    }
    console.log('::set-output name=bumped::true');
    helpers.exitSuccess(`Bumped to new version ${newVersion}.`);
  } catch (e) {
    helpers.exitFailure(`Failed to bump version: ${e}`);
  }
})();
