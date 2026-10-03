import { Module } from '@nestjs/common';
import { CompanionController } from '../companion/companion.controller';
import { CompanionService } from '../companion/companion.service';
import { CreaturesController } from '../creatures/creatures.controller';
import { CreaturesService } from '../creatures/creatures.service';
import { ChildVillageController, DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { EngineClient } from '../engine/engine.client';
import { ExplorationsController } from '../explorations/explorations.controller';
import { ExplorationsService } from '../explorations/explorations.service';
import { InventoryController } from '../inventory/inventory.controller';
import { InventoryService } from '../inventory/inventory.service';
import { ParentLettersController, PlayerLettersController } from '../letters/letters.controller';
import { LettersService } from '../letters/letters.service';
import { MinigamesController } from '../minigames/minigames.controller';
import { MinigamesService } from '../minigames/minigames.service';
import { ChildMissionsController, ParentMissionsController } from '../missions/missions.controller';
import { MissionsService } from '../missions/missions.service';
import { ChildRewardsController, ParentRewardsController } from '../rewards/rewards.controller';
import { RewardsService } from '../rewards/rewards.service';
import { RoomController } from '../room/room.controller';
import { RoomService } from '../room/room.service';
import { SocialController } from '../social/social.controller';
import { SocialService } from '../social/social.service';
import { MaintenanceService } from './maintenance.service';

/** Domaine de jeu : créatures, inventaire, missions, récompenses, exploration, courrier… */
@Module({
  controllers: [
    CreaturesController,
    InventoryController,
    ParentMissionsController,
    ChildMissionsController,
    ParentRewardsController,
    ChildRewardsController,
    ExplorationsController,
    MinigamesController,
    CompanionController,
    DashboardController,
    ChildVillageController,
    RoomController,
    SocialController,
    PlayerLettersController,
    ParentLettersController,
  ],
  providers: [
    CreaturesService,
    InventoryService,
    MissionsService,
    RewardsService,
    ExplorationsService,
    MinigamesService,
    CompanionService,
    DashboardService,
    EngineClient,
    MaintenanceService,
    RoomService,
    SocialService,
    LettersService,
  ],
})
export class GameModule {}
