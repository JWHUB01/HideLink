'use client';

import { formatPublicIdForDisplay, type BlockListResponse } from '@anonlink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/i18n';
import { describeError } from '@/lib/error-text';
import { apiRequest } from '@/lib/http';

/**
 * The caller's own block list.
 *
 * It sits beside the friend list at the bottom of the idle screen: both are durable
 * relationships the person can act on without being inside a chat. The list is shown
 * even when the administration has switched new blocks off, because that switch is not
 * an amnesty — an old block must stay removable. No banner explains the policy here;
 * the missing action in a chat is the message.
 */
export function BlockedPanel() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => apiRequest<BlockListResponse>('/blocks'),
    staleTime: 10_000,
  });

  const unblock = useMutation({
    mutationFn: (publicId: string) =>
      apiRequest<{ removed: boolean }>(`/blocks/${publicId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['blocks'] });
    },
  });

  const list = blocks.data?.blocks ?? [];

  return (
    <div className="flex flex-col gap-2">
      {/*
        Collapsed by default (owner request 2026-11-15), for the same reason as the friend
        list: it is opened on purpose, and the space it frees is reserved for advertising
        (D28). The count stays visible, because an existing block is a fact the person
        should not have to remember by opening a panel.
      */}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="blocked-panel"
      >
        <Ban className="size-3.5" aria-hidden="true" />
        {t('Заблокированные')}
        {blocks.isSuccess ? <Badge>{list.length}</Badge> : null}
        {open ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
      </Button>

      {open ? (
        <Card id="blocked-panel" aria-busy={blocks.isFetching}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <CardTitle id="blocked-heading" className="flex items-center gap-2">
              <Ban className="size-4 text-primary" aria-hidden="true" />
              {t('Заблокированные')}
              {blocks.isSuccess ? <Badge>{list.length}</Badge> : null}
            </CardTitle>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => void blocks.refetch()}
              disabled={blocks.isFetching}
              aria-label={t('Обновить список заблокированных')}
            >
              <RefreshCw
                className={blocks.isFetching ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
              />
            </Button>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            {blocks.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t('Загрузка списка')}
              </p>
            ) : null}

            {blocks.isError ? (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {describeError(blocks.error, locale)}
              </p>
            ) : null}

            {blocks.isSuccess && list.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('Список пуст.')}</p>
            ) : null}

            {list.length > 0 ? (
              <ul className="flex flex-col gap-2" aria-label={t('Список заблокированных')}>
                {list.map((block) => (
                  <li
                    key={block.publicId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-2"
                  >
                    <code translate="no" className="font-mono text-sm" title={block.publicId}>
                      {formatPublicIdForDisplay(block.publicId)}
                    </code>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unblock.isPending}
                      onClick={() => unblock.mutate(block.publicId)}
                    >
                      {unblock.isPending && unblock.variables === block.publicId ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Ban className="size-4" aria-hidden="true" />
                      )}
                      {t('Разблокировать')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {unblock.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {describeError(unblock.error, locale)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
