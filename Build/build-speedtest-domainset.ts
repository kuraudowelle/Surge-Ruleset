import fs from 'node:fs';
import path from 'node:path';

import { SpanCategory, task } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';
import { readFileIntoProcessedArray } from './lib/fetch-text-by-line';

import { DomainsetOutput } from './lib/rules/domainset';
import { OUTPUT_SURGE_DIR, SOURCE_DIR } from './constants/dir';
import { fetchLibrespeedHostnames, fetchSpeedtestNetHostnames } from './lib/speedtest-servers';

// The requests are paced, so they are started right away and the other builders are not held up
const getSpeedtestHostsGroupsPromise = fetchSpeedtestNetHostnames();
const getLibrespeedBackendsPromise = fetchLibrespeedHostnames();

const PREVIOUS_OUTPUT = path.resolve(OUTPUT_SURGE_DIR, 'domainset/speedtest.conf');

export const buildSpeedtestDomainSet = task(require.main === module, __filename)(
  async (span) => new DomainsetOutput(span, 'speedtest')
    .withTitle('Surge Ruleset - Speedtest Domains')
    .appendDescription(
      SHARED_DESCRIPTION,
      '',
      'This file contains common speedtest endpoints.'
    )
    .addFromDomainset(readFileIntoProcessedArray(path.resolve(SOURCE_DIR, 'domainset/speedtest.conf')))
    // this list keeps the domains of previous builds, there is nothing to carry over on the very first build
    .addFromDomainset(fs.existsSync(PREVIOUS_OUTPUT) ? readFileIntoProcessedArray(PREVIOUS_OUTPUT) : [])
    .bulkAddDomain(await span.traceChildPromise('get speedtest.net servers', getSpeedtestHostsGroupsPromise, SpanCategory.Network))
    .bulkAddDomain(await span.traceChildPromise('get librespeed backends', getLibrespeedBackendsPromise, SpanCategory.Network))
    .write()
);
