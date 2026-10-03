import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CONTENT_VERSION,
  CatalogIndex,
  defaultCatalog,
  type BuildingDefinition,
  type DecorDefinition,
  type EvolutionConditions,
  type EvolutionFormDefinition,
  type FamilyMissionDefinition,
  type FoodEffect,
  type FormFeature,
  type ItemDefinition,
  type LocalizedText,
  type LootTable,
  type MissionTemplateDefinition,
  type Palette,
  type RecipeDefinition,
  type SceneDefinition,
  type SpeciesDefinition,
  type ZoneDefinition,
} from '@mimo/game-data';
import { PrismaService } from '../prisma/prisma.service';
import { syncContent } from './content-sync';

const text = (value: unknown) => value as LocalizedText;

/**
 * Catalogue de contenu en mémoire, chargé depuis les tables de définition.
 * La base est la source de vérité à l'exécution (un futur back-office pourra l'éditer
 * puis appeler `reload()`), les fichiers de packages/game-data en sont la version initiale.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private current = new CatalogIndex(defaultCatalog);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  get index(): CatalogIndex {
    return this.current;
  }

  async reload(): Promise<void> {
    if ((await this.prisma.creatureSpecies.count()) === 0) {
      this.logger.warn('Contenu de jeu absent en base : synchronisation depuis packages/game-data');
      await syncContent(this.prisma, defaultCatalog);
    }
    const [species, forms, items, recipes, zones, templates, buildings, familyMissions] =
      await Promise.all([
        this.prisma.creatureSpecies.findMany({ orderBy: { id: 'asc' } }),
        this.prisma.creatureEvolution.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.itemDefinition.findMany(),
        this.prisma.recipe.findMany(),
        this.prisma.explorationZone.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.missionTemplate.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.buildingDefinition.findMany({ orderBy: { requiredPoints: 'asc' } }),
        this.prisma.familyMission.findMany({ where: { isActive: true } }),
      ]);

    this.current = new CatalogIndex({
      version: CONTENT_VERSION,
      species: species.map((s): SpeciesDefinition => ({
        key: s.id,
        name: text(s.name),
        description: text(s.description),
        emoji: s.emoji,
        affinity: s.affinity,
        palette: s.palette as unknown as Palette,
        starter: s.starter,
      })),
      evolutions: forms.map((f): EvolutionFormDefinition => ({
        key: f.id,
        species: f.speciesId,
        stage: f.stage,
        name: text(f.name),
        description: text(f.description),
        hint: text(f.hint),
        palette: f.palette as unknown as Palette,
        feature: f.feature as FormFeature,
        aura: f.aura ?? undefined,
        conditions: f.conditions as unknown as EvolutionConditions,
      })),
      items: items.map((i): ItemDefinition => ({
        key: i.id,
        name: text(i.name),
        description: text(i.description),
        category: i.category,
        rarity: i.rarity,
        emoji: i.emoji,
        price: i.price ?? undefined,
        effect: (i.effect as FoodEffect | null) ?? undefined,
        slot: i.slot ?? undefined,
        loot: (i.loot as unknown as LootTable | null) ?? undefined,
        hatchesSpecies: i.hatchesSpeciesId ?? undefined,
        unique: i.unique || undefined,
        decor: (i.decor as unknown as DecorDefinition | null) ?? undefined,
        scene: (i.scene as unknown as SceneDefinition | null) ?? undefined,
      })),
      recipes: recipes.map((r): RecipeDefinition => ({
        key: r.id,
        name: text(r.name),
        ingredients: r.ingredients,
        result: r.resultItemId,
        hint: text(r.hint),
      })),
      zones: zones.map((z): ZoneDefinition => ({
        key: z.id,
        name: text(z.name),
        description: text(z.description),
        emoji: z.emoji,
        colors: [z.colors[0] ?? '#5ccf8f', z.colors[1] ?? '#1f7a5a'],
        durationMinutes: z.durationMinutes,
        minLevel: z.minLevel,
        energyCost: z.energyCost,
        xp: { category: z.xpCategory, amount: z.xpAmount },
        loot: z.loot as unknown as LootTable,
      })),
      missionTemplates: templates.map((m): MissionTemplateDefinition => ({
        key: m.id,
        title: text(m.title),
        description: text(m.description),
        category: m.category,
        xp: m.xp,
        coins: m.coins,
        icon: m.icon,
      })),
      buildings: buildings.map((b): BuildingDefinition => ({
        key: b.id,
        name: text(b.name),
        description: text(b.description),
        emoji: b.emoji,
        requiredPoints: b.requiredPoints,
        position: { x: b.positionX, y: b.positionY },
      })),
      familyMissions: familyMissions.map((fm): FamilyMissionDefinition => ({
        key: fm.id,
        title: text(fm.title),
        description: text(fm.description),
        goalType: fm.goalType,
        target: fm.target,
        rewardPoints: fm.rewardPoints,
        icon: fm.icon,
        rewardItem: fm.rewardItemId ?? undefined,
      })),
      miniGames: defaultCatalog.miniGames,
      // Interactions entre créatures : définies dans le code versionné, comme les mini-jeux.
      social: defaultCatalog.social,
    });
    this.logger.log(
      `Catalogue chargé : ${species.length} espèces, ${forms.length} formes, ${items.length} objets`,
    );
  }
}
