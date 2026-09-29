import type { Span } from '../../trace';
import type { BaseWriteStrategy } from '../writing-strategy/base';
import { SurgeRuleSet } from '../writing-strategy/surge';
import { FileOutput } from './base';

export class IPListOutput extends FileOutput {
  strategies: BaseWriteStrategy[];

  constructor(span: Span, id: string) {
    super(span, id);

    this.strategies = [
      new SurgeRuleSet('ip')
    ];
  }
}
