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

@Module({
  controllers: [SyncController, SyncConflictsController],
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
  ],
  exports: [SyncOutboxService, SyncBusinessService, SyncConflictService],
})
export class SyncModule {}
