import type { RewardSource } from '@prisma/client';
import type { ItemDefinition } from '@mimo/game-data';
import type { Tx } from '../prisma/prisma.service';

/**
 * Crée un cadeau « objet » à ouvrir. Un objet unique (décor, souvenir) n'est jamais offert
 * deux fois : s'il est déjà possédé ou déjà en attente, rien n'est créé. Retourne vrai si
 * le cadeau a été créé. (À l'ouverture, `addItems` garantit encore l'unicité.)
 */
export async function grantItemReward(
  tx: Tx,
  def: ItemDefinition,
  reward: { familyId: string; childId: string; source: RewardSource; message: string },
): Promise<boolean> {
  if (def.unique) {
    const [owned, pending] = await Promise.all([
      tx.inventoryItem.findFirst({
        where: { inventory: { childId: reward.childId }, itemId: def.key, quantity: { gt: 0 } },
        select: { id: true },
      }),
      tx.reward.findFirst({
        where: { childId: reward.childId, type: 'ITEM', itemId: def.key, status: 'PENDING' },
        select: { id: true },
      }),
    ]);
    if (owned || pending) return false;
  }
  await tx.reward.create({
    data: {
      familyId: reward.familyId,
      childId: reward.childId,
      type: 'ITEM',
      source: reward.source,
      itemId: def.key,
      amount: 1,
      message: reward.message,
    },
  });
  return true;
}
