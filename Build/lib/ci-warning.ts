import process from 'node:process';

/** The text of a workflow command of GitHub Actions: a `%` and the line breaks in it must not cut or end the command */
function escapeData(text: string) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** The value of a property of a workflow command, which ends at a `:` or a `,` as well */
function escapeProperty(text: string) {
  return escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

/**
 * What a check has to say that is worth a look and is not a reason to stop a build: nothing is wrong yet, and something
 * that a test stood on is gone. In GitHub Actions it is an annotation of the run (`::warning::`), which is shown on the
 * page of the run and on the commit and does not fail it, and anywhere else it is a line of the log.
 */
export function warn(title: string, message: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=${escapeProperty(title)}::${escapeData(message)}`);
  } else {
    console.warn(`  warning: ${title}: ${message}`);
  }
}
