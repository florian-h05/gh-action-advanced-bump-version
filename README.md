# gh-action-advanced-bump-version

GitHub Action for automated npm version bump.
Forked from [phips28/gh-action-bump-version](https://github.com/phips28/gh-action-bump-version).

This Action bumps the version in package.json and pushes it back to the repo.

It is meant to be used on every successful merge to master or to run on schedule, but you'll need to configured that workflow yourself. 
You can look to the [`.github/workflows/autopublish.yml`](/.github/workflows/autopublish.yml) file in this project as an example.

## Workflow

* Based on the commit messages, increment the version from the latest release.
  * If the string `Breaking change`, `major` is found anywhere in any of the commit messages or descriptions the major version will be incremented.
  * If a commit message begins with the string "feat" or includes "minor" then the minor version will be increased. This works for most common commit metadata for feature additions: `feat: new API` and `feature: new API`.
  * If a commit message contains the word "pre-alpha" or "pre-beta" or "pre-rc" then the pre-release version will be increased (for example specifying pre-alpha: 1.6.0-alpha.1 -> 1.6.0-alpha.2 or, specifying pre-beta: 1.6.0-alpha.1 -> 1.6.0-beta.0)
  * All other changes will increment the patch version.
* Push the bumped npm version in package.json back into the repo.
* Push a tag for the new version back into the repo.

## Usage

Example:
```yaml
- name: 'Automated Version Bump'
  uses: 'florian-h05/gh-action-advanced-bump-version@main'
  id: version-bump
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    major-wording: 'major,Major,breaking,Breaking'
    minor-wording: 'minor,Minor,add,Add,adds,Adds,new,New'
    patch-wording: 'fix,Fix,fixes,Fixes,patch,Patch'
    rc-wording: 'rc,pre'
    hours-to-go-back: 24
    skip-if-no-commits: 'true'
    tag-prefix: 'v'
    commit-message: 'CI: bumps version to {{version}} [skip ci]'
    bump-policy: 'last-commit'
```

### Configuration

| Parameter name       | Description                                                                                                                                                                                                                                                                                                                                          | Type                                      | Required | Example                                      |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|----------|----------------------------------------------|
| `major-wording`      | Used for releasing a major version (2.0.0)                                                                                                                                                                                                                                                                                                           | `string`, case sensitive, comma separated | Yes      | `major,Major,breaking,Breaking`              |
| `minor-wording`      | Used for releasing a minor version (1.x.0)                                                                                                                                                                                                                                                                                                           | `string`, case sensitive, comma separated | Yes      | `minor,Minor,add,Add,adds,Adds,new,New`      |
| `patch-wording`      | Used for releasing a patch version (1.0.x)                                                                                                                                                                                                                                                                                                           | `string`, case sensitive, comma separated | No       | `fix,Fix,fixes,Fixes,patch,Patch`            |
| `rc-wording`         | Used for releasing a preversion                                                                                                                                                                                                                                                                                                                      | `string`, case sensitive, comma separated | No       | `rc,pre`                                     |
| `hours-to-go-back`   | If this option is set, the action can run on schedule. It then gets the commits from the last n hours and analyzes those commit messages.                                                                                                                                                                                                            | `number`                                  | No       | `24`                                         |
| `skip-if-no-commits` | If this option is set, the action does not bump if no commit happened; else release a patch.                                                                                                                                                                                                                                                         | `boolean` as `string`                     | No       | `true`                                       |
| `package-json-dir`   | Param to parse the location of the desired package.json                                                                                                                                                                                                                                                                                              | `string`                                  | No       | `frontend`                                   |
| `tag-prefix`         | Prefix that is used for the git tag                                                                                                                                                                                                                                                                                                                  | `string`                                  | No       | `v`                                          |
| `skip-tag`           | The version bump commit is not tagged                                                                                                                                                                                                                                                                                                                | `boolean` as `string`                     | No       | `true`                                       |
| `commit-message`     | Set a custom commit message for version bump commit. Useful for [skipping additional workflows](https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs) run on push.                                                                                                                                                       | `string`                                  | No       | `CI: bumps version to {{version}} [skip ci]` |
| `bump-policy`        | Set version bump ignore policy. Useful for pull requests between branches with version bumps. Options are as follows: `all` (default): checks all commit messages and skips bump if any previous bumps found; `ignore`: always bump regardless of whether bumps included in commit messages; `last-commit`: bump if last commit was not version bump | `string`                                  | No       | -                                            |
| `target-branch`      | Set a custom target branch to use when bumping the version. Useful in cases such as updating the version on master after a tag has been set.                                                                                                                                                                                                         | `string`                                  | No       | `master`                                     |
| `default`            | Set a default version bump to use (defaults to `patch`)                                                                                                                                                                                                                                                                                              | `string`                                  | No       | `prelease`                                   |
| `preid`              | Set a preid value will building prerelease version (defaults to `rc`)                                                                                                                                                                                                                                                                                | `string`                                  | No       | `rc`                                         |

### Outputs

Property | Description | Type | Example
-|-|-|-
`newVersion` | New version number | `string` | `v1.2.0`
`bumped` | Whether a version bump was performed | `boolean` as `string` | `true` or `false`

You may use those outputs in conditions for workflow steps:

```yaml
- uses: actions/setup-node@v2
  if: steps.version-bump.outputs.bumped == 'true'
  with:
    node-version: '12.x'
    registry-url: 'https://registry.npmjs.org'
- run: npm ci
  if: steps.version-bump.outputs.bumped == 'true'
- name: 'Publish to npm'  
  run: npm publish --access=public
  if: steps.version-bump.outputs.bumped == 'true'
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Development

For development, enter development mode by creating a `.env` file.
In development mode, the action won't setup git user & email and won't commit or tag anything.

**It is really important to set `NODE_ENV` to `development`, otherwise the action changes your git configuration!**

Run the action with `npm start`.

Example `.env` file:
```bash
NODE_ENV=development
GITHUB_TOKEN=<your-github-token>
GITHUB_REPOSITORY=octokit/octokit.js
GITHUB_WORKSPACE=/home/florian/git-repos/gh-action-bump-version
GITHUB_REF=/refs/heads/main
INPUT_BUMP-POLICY=last-commit
INPUT_MAJOR-WORDING=major,breaking,Major,Breaking
INPUT_MINOR-WORDING=minor,new,add,Minor,New,Add
INPUT_PATCH-WORDING=patch,fixes,fix,Patch,Fixes,Fix
INPUT_TAG-PREFIX=v
INPUT_HOURS-TO-GO-BACK=1
INPUT_SKIP-IF-NO-COMMITS=true
```

Note: The enviroment variables for GitHub events, like `GITHUB_REPOSITOTY` are described at https://docs.github.com/en/actions/learn-github-actions/environment-variables#default-environment-variables.
