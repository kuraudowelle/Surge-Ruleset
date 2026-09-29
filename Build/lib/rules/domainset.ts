import type { Span } from '../../trace';
import { AdGuardHome } from '../writing-strategy/adguardhome';
import type { BaseWriteStrategy } from '../writing-strategy/base';
import { SurgeDomainSet } from '../writing-strategy/surge';
import { FileOutput } from './base';

export class DomainsetOutput extends FileOutput {
  strategies: BaseWriteStrategy[] = [
    new SurgeDomainSet()
  ];
}

export class AdGuardHomeOutput extends FileOutput {
  strategies: BaseWriteStrategy[];

  constructor(
    span: Span,
    id: string,
    outputDir: string
  ) {
    super(span, id);

    this.strategies = [
      new AdGuardHome(outputDir)
    ];
  }
}
