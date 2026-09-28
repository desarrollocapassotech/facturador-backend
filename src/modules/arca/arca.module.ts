import { Module } from '@nestjs/common';
import { AfipSdkGateway } from './afip-sdk.gateway';
import { ArcaAuditService } from './arca-audit.service';
import { ARCA_GATEWAY } from './arca.gateway';

@Module({
  providers: [ArcaAuditService, AfipSdkGateway, { provide: ARCA_GATEWAY, useExisting: AfipSdkGateway }],
  exports: [ARCA_GATEWAY],
})
export class ArcaModule {}
