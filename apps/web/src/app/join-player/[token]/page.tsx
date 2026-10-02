'use client';

import { useParams } from 'next/navigation';
import { JoinInvitation } from '@/components/JoinInvitation';

/** Lien d'invitation d'un adulte joueur (le rôle accordé est décidé par le serveur). */
export default function JoinPlayerPage() {
  const { token } = useParams<{ token: string }>();
  return <JoinInvitation token={token} path={`/join-player/${token}`} />;
}
