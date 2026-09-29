import type { Span } from '../../trace';
import { SurgeRuleSet } from '../writing-strategy/surge';
import { FileOutput } from './base';

export class RulesetOutput extends FileOutput {
  constructor(span: Span, id: string, type: 'non_ip' | 'ip') {
    super(span, id);

    this.strategies = [
      new SurgeRuleSet(type)
    ];
  }
}

export class SurgeOnlyRulesetOutput extends FileOutput {
  constructor(
    span: Span,
    id: string,
    type: 'non_ip' | 'ip' | (string & {}),
    overrideOutputDir?: string
  ) {
    super(span, id);

    this.strategies = [
      new SurgeRuleSet(type, overrideOutputDir)
    ];
  }
}
