import { Module } from '@nestjs/common';
import { SyncCertGuard } from './sync-cert.guard';
import { SyncController } from './sync.controller';
import { SyncInboxService } from './sync-inbox.service';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncPeerGuard } from './sync-peer.guard';
import { SyncTransportService } from './sync-transport.service';
import { SyncBusinessService } from './sync-business.service';
import { SyncBusinessApplyService } from './sync-business-apply.service';
import { SyncBusinessCertService } from './sync-business-cert.service';
import { SyncConflictService } from './sync-conflict.service';
import { SyncConflictsController } from './sync-conflicts.controller';
import {
  SyncStatusCertificationController,
  SyncStatusController,
} from './sync-status.controller';
import { SyncStatusService } from './sync-status.service';
import {
  SyncDiagnosticsCertificationController,
  SyncDiagnosticsController,
} from './sync-diagnostics.controller';
import { SyncDiagnosticsService } from './sync-diagnostics.service';

@Module({
  controllers: [
    SyncController,
    SyncConflictsController,
    SyncStatusController,
    SyncStatusCertificationController,
    SyncDiagnosticsController,
    SyncDiagnosticsCertificationController,
  ],
  providers: [
    SyncOutboxService,
    SyncInboxService,
    SyncTransportService,
    SyncPeerGuard,
    SyncCertGuard,
    SyncBusinessService,
    SyncBusinessApplyService,
    SyncBusinessCertService,
    SyncConflictService,
    SyncStatusService,
    SyncDiagnosticsService,
  ],
  exports: [SyncOutboxService, SyncBusinessService, SyncConflictService],
})
export class SyncModule {}
