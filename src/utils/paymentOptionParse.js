/** Normalize proxy response body (object or JSON string). */
export function parseResponseBody(body) {
  if (body == null) return null
  if (typeof body === 'object') return body
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Flatten Payment Options channelCategories × groups.
 * @see https://developer.2c2p.com/reference/post_payment-4-3-paymentoption
 */
export function parsePaymentOptions(body) {
  const data = parseResponseBody(body)
  if (!data) {
    return { ok: false, error: 'invalid_json', categories: [], defaultSelection: null }
  }

  const ok = data.respCode === '0000'
  const categories = []

  for (const cat of data.channelCategories || []) {
    for (const grp of cat.groups || []) {
      categories.push({
        categoryCode: cat.code || '',
        categoryName: cat.name || '',
        groupCode: grp.code || '',
        groupName: grp.name || '',
        isDefault: Boolean(cat.default && grp.default),
        iconUrl: grp.iconUrl || cat.iconUrl || null,
      })
    }
  }

  const defaultSelection = categories.find((c) => c.isDefault) || categories[0] || null

  return {
    ok,
    respCode: data.respCode,
    respDesc: data.respDesc,
    categories,
    defaultSelection,
  }
}

/**
 * Parse Payment Option Details channels → payment.code fields.
 * @see https://developer.2c2p.com/docs/api-payment-option-details
 */
export function parsePaymentOptionDetails(body) {
  const data = parseResponseBody(body)
  if (!data) {
    return { ok: false, error: 'invalid_json', channels: [] }
  }

  const ok = data.respCode === '0000'
  const channels = (data.channels || []).map((ch, idx) => {
    const code = ch.payment?.code || {}
    const input = ch.payment?.input || {}
    return {
      sequenceNo: ch.sequenceNo ?? idx + 1,
      name: ch.name || '',
      channelCode: code.channelCode || '',
      agentCode: code.agentCode || '',
      agentChannelCode: code.agentChannelCode || '',
      requiresCard: input.cardNo === 'M',
      isDown: Boolean(ch.isDown),
      iconUrl: ch.iconUrl || null,
    }
  })

  return {
    ok,
    respCode: data.respCode,
    respDesc: data.respDesc,
    categoryCode: data.categoryCode || '',
    groupCode: data.groupCode || '',
    name: data.name || '',
    totalChannel: data.totalChannel ?? channels.length,
    channels,
  }
}

/** Merge category list with parallel Details fetch results. */
export function buildChannelGroups(categories, detailResults = []) {
  return categories
    .map((cat, i) => {
      const detail = detailResults[i] || {}
      return {
        categoryCode: cat.categoryCode,
        categoryName: cat.categoryName,
        groupCode: cat.groupCode,
        groupName: cat.groupName,
        ok: Boolean(detail.ok),
        respCode: detail.respCode,
        respDesc: detail.respDesc,
        channels: detail.channels || [],
      }
    })
    .filter((g) => g.channels.length > 0)
}

/** Count total channels across all groups. */
export function countChannelsInGroups(groups) {
  return (groups || []).reduce((sum, g) => sum + (g.channels?.length || 0), 0)
}
export function categorySelectionToFlow(row) {
  return {
    categoryCode: row.categoryCode,
    groupCode: row.groupCode,
    categoryName: row.categoryName,
    groupName: row.groupName,
  }
}

/** Build partial flow state from a selected channel + context. */
export function channelSelectionToFlow(channel, context = {}) {
  return {
    categoryCode: context.categoryCode || '',
    groupCode: context.groupCode || '',
    categoryName: context.categoryName,
    groupName: context.groupName,
    channelCode: channel.channelCode,
    agentCode: channel.agentCode || '',
    agentChannelCode: channel.agentChannelCode || '',
    selectedChannelName: channel.name,
    requiresCard: channel.requiresCard,
  }
}
