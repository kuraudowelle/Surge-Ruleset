export function createFileDescription(license = 'AGPL 3.0') {
  return [
    `License: ${license}`,
    'GitHub: https://github.com/kuraudowelle/Surge-Ruleset'
  ];
}

export const SHARED_DESCRIPTION = createFileDescription('AGPL 3.0');
