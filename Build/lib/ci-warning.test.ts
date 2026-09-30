import process from 'node:process';
import { mock } from 'node:test';
import { afterEach, describe, it } from 'mocha';
import { expect } from 'earl';
import { noop } from 'foxts/noop';

import { warn } from './ci-warning';

describe('warn', () => {
  const before = process.env.GITHUB_ACTIONS;

  afterEach(() => {
    mock.restoreAll();
    if (before === undefined) {
      delete process.env.GITHUB_ACTIONS;
    } else {
      process.env.GITHUB_ACTIONS = before;
    }
  });

  it('is an annotation of the run in GitHub Actions, on a line of its own', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const log = mock.method(console, 'log', noop);
    const warning = mock.method(console, 'warn', noop);

    warn('An overlap is gone', 'api.github.com is not in non_ip/ai.conf any more');

    expect(log.mock.calls.map(call => call.arguments)).toEqual([['::warning title=An overlap is gone::api.github.com is not in non_ip/ai.conf any more']]);
    expect(warning.mock.calls.length).toEqual(0);
  });

  it('keeps a `%`, a line break, a colon and a comma from cutting the command', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const log = mock.method(console, 'log', noop);

    warn('100%: a, b', 'one\ntwo\r\nthree 50%');

    expect(log.mock.calls.map(call => call.arguments)).toEqual([['::warning title=100%25%3A a%2C b::one%0Atwo%0D%0Athree 50%25']]);
  });

  it('is a line of the log anywhere else', () => {
    delete process.env.GITHUB_ACTIONS;
    const log = mock.method(console, 'log', noop);
    const warning = mock.method(console, 'warn', noop);

    warn('An overlap is gone', 'api.github.com is not in non_ip/ai.conf any more');

    expect(warning.mock.calls.map(call => call.arguments)).toEqual([['  warning: An overlap is gone: api.github.com is not in non_ip/ai.conf any more']]);
    expect(log.mock.calls.length).toEqual(0);
  });
});
