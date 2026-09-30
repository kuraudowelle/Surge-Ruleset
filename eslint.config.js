'use strict';

module.exports = require('eslint-config-sukka').sukka({
  ignores: [
    '**/*.conf',
    '**/*.txt'
  ],
  js: {
    disableNoConsoleInCLI: ['Build/**']
  },
  node: true,
  ts: true,
  yaml: false
}, {
  // A configuration that has nothing but `ignores` is a global one. The scripts of Mock/ are served in place of the ones
  // of ad networks and trackers, and are not written in the style of this project: they are 1,351 of the errors of a lint
  // of all of it, and not what a lint here is for
  ignores: ['Mock/**']
}, {
  rules: {
    'sukka/unicorn/filename-case': 'off',
    'sukka/prefer-foxts-noop': 'off'
  }
});
