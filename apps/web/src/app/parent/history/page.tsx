'use client';

import type { GameEventView } from '@mimo/types';
import { Button, ParentPanel, Spinner } from '@mimo/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SelectField } from '@/components/forms';
import { Timeline } from '@/components/parent';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { keys, useProfiles } from '@/lib/queries';

export default function ParentHistoryPage() {
  const { t } = useI18n();
  const { data: profiles } = useProfiles();
  const [childId, setChildId] = useState('');
  const query = useInfiniteQuery({
    queryKey: keys.parent.history(childId),
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (childId) params.set('childId', childId);
      if (pageParam) params.set('before', pageParam);
      return http.get<GameEventView[]>(`/parent/history?${params.toString()}`);
    },
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1]?.createdAt : undefined),
  });
  const events = query.data?.pages.flat() ?? [];

  return (
    <ParentPanel
      title={t('parentHistory.title')}
      actions={
        <SelectField
          label={t('parentRewards.child')}
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          className="min-w-48"
        >
          <option value="">{t('parentHistory.all')}</option>
          {profiles?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.avatar} {p.displayName}
            </option>
          ))}
        </SelectField>
      }
    >
      {query.isPending ? (
        <Spinner size={28} />
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">{t('parentHistory.empty')}</p>
      ) : (
        <>
          <Timeline events={events} />
          {query.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              {t('parentHistory.more')}
            </Button>
          )}
        </>
      )}
    </ParentPanel>
  );
}
