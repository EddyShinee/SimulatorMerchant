import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { omitEmptyFields } from '../config/paymentTokenFields.js'

function filterChannelGroups(groups, query) {
  const q = query.trim().toLowerCase()
  if (!q) return groups

  return groups
    .map((group) => {
      const groupText = [group.categoryCode, group.groupCode, group.categoryName, group.groupName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (groupText.includes(q)) return group

      const channels = (group.channels || []).filter((ch) => {
        const text = [ch.name, ch.channelCode, ch.agentCode, ch.agentChannelCode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return text.includes(q)
      })

      return { ...group, channels }
    })
    .filter((g) => (g.channels?.length || 0) > 0)
}

function ChannelCodePreview({ channel, context, selected }) {
  const { t } = useLanguage()

  const codes = channel
    ? omitEmptyFields({
        channelCode: channel.channelCode,
        agentCode: channel.agentCode,
        agentChannelCode: channel.agentChannelCode,
      })
    : selected?.channelCode
      ? omitEmptyFields({
          channelCode: selected.channelCode,
          agentCode: selected.agentCode,
          agentChannelCode: selected.agentChannelCode,
        })
      : null

  if (!codes) return null

  const label = channel
    ? `${context?.categoryCode || ''} / ${context?.groupCode || ''} → ${channel.name}`
    : selected?.selectedChannelName
      ? `${selected.categoryCode} / ${selected.groupCode} → ${selected.selectedChannelName}`
      : ''

  return (
    <div className="border-b border-brand-200 bg-brand-50/90 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/40">
      <p className="text-xs font-semibold text-brand-800 dark:text-brand-200">
        📌 {t('paymentOptionDetails.selectedChannelPreview')}
        {label && <span className="ml-1 font-normal text-brand-600 dark:text-brand-300">({label})</span>}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-200 bg-white px-3 py-2 dark:border-brand-800 dark:bg-slate-900">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">channelCode</p>
          <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
            {codes.channelCode || '—'}
          </p>
        </div>
        <div className="rounded-lg border border-brand-200 bg-white px-3 py-2 dark:border-brand-800 dark:bg-slate-900">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">agentCode</p>
          <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
            {codes.agentCode || '—'}
          </p>
        </div>
        <div className="rounded-lg border border-brand-200 bg-white px-3 py-2 dark:border-brand-800 dark:bg-slate-900">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">agentChannelCode</p>
          <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
            {codes.agentChannelCode || '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

function ChannelRow({ ch, context, selected, onSelect }) {
  const { t } = useLanguage()

  const isActive =
    selected?.categoryCode === context.categoryCode &&
    selected?.groupCode === context.groupCode &&
    selected?.selectedChannelName === ch.name &&
    selected?.channelCode === ch.channelCode &&
    (selected?.agentCode || '') === (ch.agentCode || '') &&
    (selected?.agentChannelCode || '') === (ch.agentChannelCode || '')

  const handleSelect = () => {
    if (!ch.isDown) onSelect(ch, context)
  }

  return (
    <li
      role="button"
      tabIndex={ch.isDown ? -1 : 0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (!ch.isDown && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleSelect()
        }
      }}
      className={
        ch.isDown
          ? 'cursor-not-allowed px-4 py-2.5 opacity-50'
          : isActive
            ? 'cursor-pointer bg-brand-100/70 px-4 py-2.5 dark:bg-brand-950/50'
            : 'cursor-pointer px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }
    >
      <div className="flex items-center gap-2">
        {ch.iconUrl && <img src={ch.iconUrl} alt="" className="h-5 w-5 object-contain" />}
        <span className={isActive ? 'font-semibold text-brand-800 dark:text-brand-200' : ''}>
          {ch.name}
        </span>
        {ch.isDown && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">DOWN</span>
        )}
        {isActive && (
          <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t('paymentOptionDetails.selectedBadge')}
          </span>
        )}
      </div>
    </li>
  )
}

function CategorySection({ group, selected, onSelect, defaultOpen, forceOpen }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(defaultOpen ?? true)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const context = {
    categoryCode: group.categoryCode,
    groupCode: group.groupCode,
    categoryName: group.categoryName,
    groupName: group.groupName,
  }

  const hasSelection =
    selected?.categoryCode === group.categoryCode && selected?.groupCode === group.groupCode

  const channelCount = group.channels?.length || 0
  if (!channelCount) return null

  return (
    <section className="border-b border-slate-200 last:border-b-0 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          hasSelection
            ? 'bg-brand-50/80 dark:bg-brand-950/30'
            : 'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {group.categoryName || group.categoryCode}
            </span>
            {group.groupName && group.groupName !== group.categoryName && (
              <span className="text-sm text-slate-600 dark:text-slate-300">· {group.groupName}</span>
            )}
            <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {group.categoryCode} / {group.groupCode}
            </span>
            {hasSelection && (
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {t('paymentOptionDetails.categoryHasSelection')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t('paymentOptionDetails.categoryChannelCount').replace('{count}', String(channelCount))}
          </p>
        </div>
        <span
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-700 dark:border-slate-700/80">
          {(group.channels || []).map((ch) => (
            <ChannelRow
              key={`${group.categoryCode}:${group.groupCode}:${ch.name}:${ch.sequenceNo}`}
              ch={ch}
              context={context}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * @param {object} props
 * @param {Array} [props.groups] - All category groups with channels
 * @param {Array} [props.channels] - Single-group channels (legacy)
 * @param {object} [props.context] - Single-group context
 */
export default function PaymentChannelPicker({
  groups,
  channels,
  context,
  selected,
  onSelect,
  activeChannel,
  activeContext,
}) {
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')

  const normalizedGroups = groups?.length
    ? groups
    : channels?.length
      ? [
          {
            categoryCode: context?.categoryCode,
            categoryName: context?.categoryName,
            groupCode: context?.groupCode,
            groupName: context?.groupName,
            channels,
          },
        ]
      : []

  const isSearching = searchQuery.trim().length > 0
  const filteredGroups = useMemo(
    () => filterChannelGroups(normalizedGroups, searchQuery),
    [normalizedGroups, searchQuery]
  )

  const totalChannels = normalizedGroups.reduce((n, g) => n + (g.channels?.length || 0), 0)
  const visibleChannels = filteredGroups.reduce((n, g) => n + (g.channels?.length || 0), 0)
  if (!totalChannels) return null

  const previewChannel = activeChannel || null
  const previewContext = activeContext || context || null
  const multipleCategories = normalizedGroups.length > 1

  return (
    <div className="card overflow-hidden p-0">
      <ChannelCodePreview channel={previewChannel} context={previewContext} selected={selected} />

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          💳 {t('paymentOptionDetails.channelPickerTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {multipleCategories
            ? t('paymentOptionDetails.channelPickerGroupedHint')
                .replace('{categories}', String(normalizedGroups.length))
                .replace('{count}', String(totalChannels))
            : context?.categoryCode
              ? `${context.categoryCode} / ${context.groupCode} — ${t('paymentOptionDetails.channelPickerHint')}`
              : t('paymentOptionDetails.channelPickerHint')}
        </p>
        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            type="search"
            className="input w-full py-2 pl-9 pr-9 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('paymentOptionDetails.channelSearchPlaceholder')}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('paymentOptionDetails.channelSearchClear')}
            >
              ✕
            </button>
          )}
        </div>
        {isSearching && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {visibleChannels > 0
              ? t('paymentOptionDetails.channelSearchResult')
                  .replace('{visible}', String(visibleChannels))
                  .replace('{total}', String(totalChannels))
              : t('paymentOptionDetails.channelSearchNoResults')}
          </p>
        )}
      </div>

      <div>
        {filteredGroups.length === 0 && isSearching ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            {t('paymentOptionDetails.channelSearchNoResults')}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <CategorySection
              key={`${group.categoryCode}:${group.groupCode}`}
              group={group}
              selected={selected}
              onSelect={onSelect}
              forceOpen={isSearching}
              defaultOpen={
                multipleCategories
                  ? selected?.categoryCode === group.categoryCode && selected?.groupCode === group.groupCode
                  : true
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
