'use client';

import { ChevronDown, ChevronUp, LoaderCircle, Search } from 'lucide-react';
import { useState } from 'react';

import { AdSlot } from '@/components/ad-slot';
import { SettingsPanel, SettingsSkeleton } from '@/components/settings-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/i18n';
import { client } from '@/lib/anonymous-client';
import { formatElapsed, formatRemaining } from '@/lib/format';
import { CRITERION_LABELS, describeCriteria } from '@/lib/labels';
import { useTicker } from '@/lib/use-ticker';
import { useAppStore, type SessionInfo } from '@/store/app-store';

/**
 * Random matching, and the settings that shape it — one page, no tabs.
 *
 * ## Why the settings are a disclosure under the button
 *
 * The owner asked for exactly that (docs/DECISIONS.md D22). It also happens to be the
 * right shape: the call to action is the one thing a returning user wants, the filters
 * are something you set once and then rarely revisit, and a filter you cannot see is a
 * filter you will blame the search for. So the collapsed state still *states* what is
 * applied and offers one button to change it.
 *
 * ## Two states, two sources for the filters
 *
 * The waiting screen reports the criteria the *server* says it is applying, not the ones
 * the form holds: the moment the server widens the search the form is out of date, and
 * telling the user the wrong criteria would be worse than telling them nothing. The
 * elapsed timer is there because "how long have I been waiting" is the one thing a waiting
 * user wants to know, and it proves the request is still alive.
 */
export function SearchPanel({ session }: { session: SessionInfo | null }) {
  const { locale, t } = useI18n();
  const phase = useAppStore((state) => state.phase);
  const searchingSince = useAppStore((state) => state.searchingSince);
  const searchCriteria = useAppStore((state) => state.searchCriteria);
  const relaxAfterMs = useAppStore((state) => state.relaxAfterMs);
  const relaxedCriteria = useAppStore((state) => state.relaxedCriteria);
  const savedSearch = useAppStore((state) => state.session?.search ?? null);

  const [pending, setPending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const searching = phase === 'searching';
  // Ticks only while the waiting screen is visible.
  const now = useTicker(searching);

  async function start() {
    setPending(true);
    await client.startMatching();
    setPending(false);
  }

  async function cancel() {
    setPending(true);
    await client.cancelMatching();
    setPending(false);
  }

  if (searching) {
    const active = searchCriteria ? describeCriteria(searchCriteria, locale) : [];
    // `relaxAfterMs` is measured from the moment the search started, and the start time is
    // the server's own `queuedAt`, so the deadline is exact rather than approximate.
    const relaxAt =
      relaxAfterMs !== null && searchingSince
        ? new Date(new Date(searchingSince).getTime() + relaxAfterMs).toISOString()
        : null;

    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
              {t('Ищем собеседника…')}
            </span>
            <span
              translate="no"
              className="font-mono text-xl tabular-nums"
              aria-label={t('Время ожидания')}
            >
              {searchingSince ? formatElapsed(searchingSince, now) : '00:00'}
            </span>
            <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={pending}>
              {t('Отменить поиск')}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <p className="section-label">{t('Ищем по фильтрам')}</p>

            {active.length === 0 ? (
              <p className="text-sm">{t('Без фильтров — подойдёт любой собеседник.')}</p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-sm">
                {active.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {relaxedCriteria.length > 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t('Уже снято: {criteria}', {
                  criteria: relaxedCriteria
                    .map((criterion) => t(CRITERION_LABELS[criterion]))
                    .join(', '),
                })}
              </p>
            ) : null}

            {relaxAt ? (
              /*
                The countdown is pulled out of the sentence and marked untranslatable: it
                ticks every second, so inside a sentence a browser translator would retranslate
                the whole sentence on every tick (docs/DECISIONS.md D29).
              */
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                <p>
                  {t(
                    'Если никто не найдётся, сервер начнёт снимать фильтры по одному и каждый раз сообщит, какой именно.',
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <span>{t('До первого шага:')}</span>
                  <span translate="no" className="font-mono tabular-nums">
                    {formatRemaining(relaxAt, now, locale)}
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            {t('Можно не ждать здесь — поиск продолжится, а чат откроется автоматически.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const saved = savedSearch ? describeCriteria(savedSearch, locale) : [];

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Button size="lg" onClick={() => void start()} disabled={pending} className="w-full">
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t('Начинаем…')}
              </>
            ) : (
              <>
                <Search className="size-4" aria-hidden="true" />
                {t('Найти собеседника')}
              </>
            )}
          </Button>

          {/*
            The whole summary is the control (owner request 2026-11-15): one compact
            button that opens the filter panel, instead of a row plus a separate
            "Настройки" button. Everything sits on a single line, so the block is as short
            as a button; a long criteria list is truncated rather than wrapped.
          */}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-controls="settings-panel"
            aria-label={t('Фильтры поиска')}
            className="flex w-fit max-w-full flex-nowrap items-center gap-2 self-start rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:bg-muted"
          >
            <span className="section-label shrink-0">{t('Фильтры поиска')}</span>
            <span className="max-w-[24rem] truncate text-xs text-muted-foreground">
              {saved.length > 0
                ? saved.join(' · ')
                : t('Нажмите чтобы выбрать параметры собеседника')}
            </span>
            {settingsOpen ? (
              <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </CardContent>
      </Card>

      {settingsOpen ? (
        <div id="settings-panel">
          {session ? <SettingsPanel session={session} /> : <SettingsSkeleton />}
        </div>
      ) : (
        /*
          Folding the settings leaves the largest empty area on the page, and the owner
          asked for it to be given to advertising (docs/DECISIONS.md D28). So it is a
          real, sized container that takes exactly the space the settings would have
          filled — a creative added later changes the content, not the layout. While
          there is nothing to show it paints nothing, like the side rails (D23).
        */
        <aside aria-hidden="true" data-ad-slot="under-settings" className="flex min-h-40 flex-1">
          <AdSlot variant="banner" />
        </aside>
      )}
    </div>
  );
}
