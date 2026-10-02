'use client';

import { useParams } from 'next/navigation';
import { JoinInvitation } from '@/components/JoinInvitation';

/** Lien d'invitation d'un parent supplémentaire. */
export default function JoinParentPage() {
  const { token } = useParams<{ token: string }>();
  return <JoinInvitation token={token} path={`/join-parent/${token}`} />;
}
