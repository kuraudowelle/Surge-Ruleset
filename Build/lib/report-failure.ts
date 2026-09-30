import process from 'node:process';
import { extractErrorMessage } from 'foxts/extract-error-message';

/**
 * A ruleset whose data is gone or empty this time must not hold back the rest of the build (the whole run
 * fails, and nothing is published, when a task throws): it is not written, so that the file of the last build
 * that could write it stays, and this says so in the log, and on GitHub Actions as a warning on the run.
 *
 * `title` is a short sentence without a colon or a comma, since it is a property of a workflow command.
 */
export function reportRulesetFailure(scope: string, file: string, title: string, error: unknown) {
  console.error(`[${scope}]`, `${file} was not written this time, a file of an earlier build is left as it is`, error);

  if (process.env.GITHUB_ACTIONS === 'true') {
    // A build that stays green gets no other mark on the page of the run. https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
    const message = (extractErrorMessage(error, false) ?? 'unknown error').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::warning title=${title}::${message}`);
  }
}
