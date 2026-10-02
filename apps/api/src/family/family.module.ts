import { Module } from '@nestjs/common';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyInvitationsController, JoinInvitationController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  controllers: [FamilyController, FamilyInvitationsController, JoinInvitationController],
  providers: [FamilyService, InvitationsService],
  exports: [FamilyService],
})
export class FamilyModule {}
