// ============================================================
// WhatsApp Engine - simulation layer.
// In a real deployment this module would wrap Baileys / whatsapp-web.js.
// Here it manages connection state, QR generation (simulated), and
// the message processing pipeline (save -> AI -> reply -> log -> notify).
// ============================================================
import { db } from '@/lib/db'
import { generateReply } from '@/lib/ai-engine'
import { dispatchWebhooks } from '@/lib/webhook-dispatcher'
import { analyzeSentiment } from '@/lib/sentiment'

export interface ProcessIncomingResult {
  ok: boolean
  contactId: string
  replyText: string | null
  replyMessageId: string | null
  leadScore: number
  ownerRequested: boolean
  ownerNotified: boolean
  aiSkipped: boolean
  sentiment?: string
  intent?: string
  sentimentScore?: number
  error?: string
}

// In-process uptime tracker (resets on server restart)
export const SYSTEM_START = new Date()

let qrCounter = 0
// Generate a fake-but-stable QR string (a data URL placeholder). In real impl
// this would come from the WhatsApp Web multi-device pairing.
export function generateQrPayload(): string {
  qrCounter += 1
  const token = `${Date.now().toString(36)}-${qrCounter}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
  // QR data payload (a real WhatsApp pairing string would go here)
  return `2@QorvixNodeWA_${token},QorvixNode_Technologies,${new Date().toISOString()}`
}

export async function getWhatsAppSession() {
  let s = await db.session.findUnique({ where: { id: 'whatsapp' } })
  if (!s) {
    s = await db.session.create({ data: { id: 'whatsapp' } })
  }
  return s
}

export async function setWhatsAppState(
  state: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'logged_out',
  patch: Partial<{
    connectedNumber: string
    connectedName: string
    deviceInfo: string
    qrCode: string
    connectedAt: Date | null
  }> = {},
) {
  const data = {
    state,
    lastSeen: new Date(),
    ...patch,
  }
  return db.session.upsert({
    where: { id: 'whatsapp' },
    update: data,
    create: { id: 'whatsapp', ...data },
  })
}

// Simulate "connect": generate a QR. In a real backend this would start the
// WA websocket and surface the actual pairing QR. The dashboard polls until
// the user "scans" (we simulate the scan by calling confirmWhatsAppLogin).
export async function requestWhatsAppQR() {
  const qr = generateQrPayload()
  await setWhatsAppState('qr_ready', { qrCode: qr, connectedNumber: '', connectedName: '', connectedAt: null })
  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: 'WhatsApp QR generated (awaiting scan)',
    },
  })
  return qr
}

export async function confirmWhatsAppLogin(number: string, name: string) {
  await setWhatsAppState('connected', {
    connectedNumber: number,
    connectedName: name,
    deviceInfo: 'Chrome on Android · QorvixNode WA',
    connectedAt: new Date(),
    qrCode: '',
  })
  await db.notification.create({
    data: {
      type: 'wa_connected',
      title: 'WhatsApp Connected',
      body: `Connected as ${name} (${number})`,
      severity: 'success',
    },
  })
  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `WhatsApp connected as ${name} (${number})`,
    },
  })
  // Fire webhook: whatsapp.connected
  void dispatchWebhooks('whatsapp.connected', { number, name, connectedAt: new Date().toISOString() })
}

export async function disconnectWhatsApp() {
  await setWhatsAppState('disconnected', {
    connectedNumber: '',
    connectedName: '',
    connectedAt: null,
    qrCode: '',
  })
  await db.notification.create({
    data: {
      type: 'wa_disconnected',
      title: 'WhatsApp Disconnected',
      body: 'Session was disconnected manually',
      severity: 'warning',
    },
  })
  await db.log.create({
    data: { category: 'whatsapp', level: 'warn', message: 'WhatsApp disconnected' },
  })
  // Fire webhook: whatsapp.disconnected
  void dispatchWebhooks('whatsapp.disconnected', { reason: 'manual' })
}

export async function logoutWhatsApp() {
  await setWhatsAppState('logged_out', {
    connectedNumber: '',
    connectedName: '',
    connectedAt: null,
    qrCode: '',
  })
  await db.log.create({
    data: { category: 'whatsapp', level: 'warn', message: 'WhatsApp logged out' },
  })
}

// ------------------------------------------------------------
// Incoming message pipeline (the core of the platform)
// ------------------------------------------------------------
export async function processIncomingMessage(opts: {
  phone: string
  name?: string
  text: string
  countryCode?: string
}): Promise<ProcessIncomingResult> {
  const { phone, name, text, countryCode } = opts
  // 1. Upsert contact
  let contact = await db.contact.findUnique({ where: { phone } })
  if (!contact) {
    contact = await db.contact.create({
      data: {
        phone,
        name: name || phone,
        countryCode: countryCode || '',
        whatsappId: phone + '@s.whatsapp.net',
        status: 'new',
        language: 'en',
      },
    })
    await db.notification.create({
      data: {
        type: 'new_customer',
        title: 'New Customer',
        body: `${contact.name} (${phone}) sent their first message`,
        contactId: contact.id,
        severity: 'info',
      },
    })
    await db.log.create({
      data: {
        category: 'whatsapp',
        level: 'info',
        message: `New contact created: ${contact.name} (${phone})`,
        contactId: contact.id,
      },
    })
    // Fire webhook: contact.created
    void dispatchWebhooks('contact.created', { contact: { id: contact.id, name: contact.name, phone: contact.phone } })
  }

  // 2. Save incoming message
  const incoming = await db.message.create({
    data: {
      contactId: contact.id,
      direction: 'incoming',
      source: 'customer',
      text,
      status: 'delivered',
      read: false,
    },
  })

  // 2b. Sentiment analysis — runs in the background, non-blocking.
  // If it fails, the pipeline still continues. The result is stored
  // both on the Message record and as a SentimentAnalysis row for the
  // dashboard's history.
  let sentimentLabel: string = 'unknown'
  let sentimentScoreNum = 0
  let sentimentIntent = ''
  try {
    const sentimentResult = await analyzeSentiment(text)
    sentimentLabel = sentimentResult.sentiment
    sentimentScoreNum = sentimentResult.score
    sentimentIntent = sentimentResult.intent
    await db.message.update({
      where: { id: incoming.id },
      data: {
        sentiment: sentimentLabel,
        sentimentScore: sentimentScoreNum,
        intent: sentimentIntent,
      },
    })
    await db.sentimentAnalysis.create({
      data: {
        contactId: contact.id,
        messageId: incoming.id,
        sentiment: sentimentLabel,
        score: sentimentScoreNum,
        intent: sentimentIntent,
        summary: sentimentResult.summary,
      },
    })
    // Urgent / negative → owner notification (severity: warning).
    if (sentimentLabel === 'urgent' || sentimentLabel === 'negative') {
      await db.notification.create({
        data: {
          type: 'owner_request',
          title:
            sentimentLabel === 'urgent'
              ? `Urgent message from ${contact.name}`
              : `Negative message from ${contact.name}`,
          body: `${contact.name} (${phone}): "${text.slice(0, 140)}"`,
          contactId: contact.id,
          severity: 'warning',
        },
      })
      await db.log.create({
        data: {
          category: 'ai',
          level: 'warn',
          message: `Sentiment ${sentimentLabel} detected from ${contact.name} (${phone})`,
          contactId: contact.id,
          meta: JSON.stringify({ sentiment: sentimentLabel, score: sentimentScoreNum, intent: sentimentIntent }),
        },
      })
      void dispatchWebhooks('owner.requested', {
        contactId: contact.id,
        phone,
        sentiment: sentimentLabel,
        intent: sentimentIntent,
        lastMessage: text,
      })
    }
  } catch (err) {
    // Non-fatal: log and continue the pipeline.
    await db.log.create({
      data: {
        category: 'ai',
        level: 'warn',
        message: `Sentiment analysis failed: ${(err as Error).message}`,
        contactId: contact.id,
      },
    })
  }

  // 3. Update contact lastSeen / lastMessageAt
  await db.contact.update({
    where: { id: contact.id },
    data: {
      lastSeen: new Date(),
      lastMessageAt: new Date(),
      status: contact.status === 'new' ? 'active' : contact.status,
    },
  })

  // Fire webhook: message.received
  void dispatchWebhooks('message.received', { contactId: contact.id, text })

  // 4. Lead scoring + intent detection (heuristic + AI in generateReply)
  // 5. Check human-takeover: if active, skip AI reply
  if (contact.humanMode) {
    await db.log.create({
      data: {
        category: 'ai',
        level: 'info',
        message: `AI reply skipped - human mode active for ${contact.name}`,
        contactId: contact.id,
      },
    })
    return {
      ok: true,
      contactId: contact.id,
      replyText: null,
      replyMessageId: null,
      leadScore: contact.leadScore,
      ownerRequested: false,
      ownerNotified: false,
      aiSkipped: true,
      sentiment: sentimentLabel,
      sentimentScore: sentimentScoreNum,
      intent: sentimentIntent,
    }
  }

  // 6. Check auto-reply enabled
  const autoReply = await db.autoReplySetting.findUnique({ where: { id: 'autoreply' } })
  if (autoReply && !autoReply.enabled) {
    return {
      ok: true,
      contactId: contact.id,
      replyText: null,
      replyMessageId: null,
      leadScore: contact.leadScore,
      ownerRequested: false,
      ownerNotified: false,
      aiSkipped: true,
      sentiment: sentimentLabel,
      sentimentScore: sentimentScoreNum,
      intent: sentimentIntent,
    }
  }

  // 7. Generate AI reply
  let result
  try {
    result = await generateReply(contact.id, text)
  } catch (err) {
    await db.log.create({
      data: {
        category: 'ai',
        level: 'error',
        message: `AI reply generation threw: ${(err as Error).message}`,
        contactId: contact.id,
      },
    })
    // Fire webhook: ai.error
    void dispatchWebhooks('ai.error', { contactId: contact.id, error: (err as Error).message })
    return {
      ok: false,
      contactId: contact.id,
      replyText: null,
      replyMessageId: null,
      leadScore: contact.leadScore,
      ownerRequested: false,
      ownerNotified: false,
      aiSkipped: false,
      sentiment: sentimentLabel,
      sentimentScore: sentimentScoreNum,
      intent: sentimentIntent,
      error: (err as Error).message,
    }
  }

  // 8. Save AI reply as outgoing message
  const outgoing = await db.message.create({
    data: {
      contactId: contact.id,
      direction: 'outgoing',
      source: 'ai',
      text: result.reply,
      status: 'sent',
      leadDelta: Math.max(0, result.leadScore - contact.leadScore),
    },
  })

  // Fire webhook: message.sent (AI)
  void dispatchWebhooks('message.sent', { contactId: contact.id, text: result.reply, source: 'ai', messageId: outgoing.id })

  // 9. Update memory
  for (const m of result.memoryUpdates) {
    await db.conversationMemory.upsert({
      where: { contactId_key: { contactId: contact.id, key: m.key } },
      update: { value: m.value },
      create: { contactId: contact.id, key: m.key, value: m.value },
    })
  }

  // 10. Update contact lead score, language, detected service
  const previousScore = contact.leadScore
  const newScore = Math.max(previousScore, result.leadScore)
  await db.contact.update({
    where: { id: contact.id },
    data: {
      leadScore: newScore,
      detectedService: result.category,
      language: result.memoryUpdates.find((m) => m.key === 'language')?.value ?? contact.language,
      status: newScore >= 70 ? 'lead' : contact.status === 'new' ? 'active' : contact.status,
    },
  })

  // 11. Persist lead score history
  if (newScore !== previousScore) {
    await db.leadScore.create({
      data: {
        contactId: contact.id,
        score: newScore,
        category: result.category,
        reason: `Heuristic + AI detection from message`,
      },
    })
  }

  // Fire webhook: lead.created (first time crossing into 'lead' status)
  if (previousScore < 25 && newScore >= 25 && contact.status !== 'lead') {
    void dispatchWebhooks('lead.created', { contactId: contact.id, leadScore: newScore, category: result.category })
  }

  // 12. Owner request -> notify owner
  let ownerNotified = false
  const owner = await db.owner.findUnique({ where: { id: 'owner' } })
  if (result.ownerRequested && owner?.humanTakeover) {
    await db.notification.create({
      data: {
        type: 'owner_request',
        title: 'Owner Requested',
        body: `${contact.name} (${phone}) asked to speak to a human. Last message: "${text.slice(0, 120)}"`,
        contactId: contact.id,
        severity: 'warning',
      },
    })
    // auto-enable human mode
    await db.contact.update({
      where: { id: contact.id },
      data: { humanMode: true },
    })
    ownerNotified = true
    await db.log.create({
      data: {
        category: 'owner_notify',
        level: 'info',
        message: `Owner requested by ${contact.name} (${phone}); human mode auto-enabled`,
        contactId: contact.id,
      },
    })
    // Fire webhook: owner.requested
    void dispatchWebhooks('owner.requested', { contactId: contact.id, phone, lastMessage: text })
  }

  // 13. Hot-lead owner notification
  if (!ownerNotified && owner?.leadNotify && newScore >= (owner.leadThreshold ?? 70) && previousScore < (owner.leadThreshold ?? 70)) {
    await db.notification.create({
      data: {
        type: 'new_lead',
        title: 'New Hot Lead',
        body: `${contact.name} (${phone}) crossed the lead threshold (score ${newScore}). Service: ${result.category}`,
        contactId: contact.id,
        severity: 'success',
      },
    })
    ownerNotified = true
    await db.log.create({
      data: {
        category: 'lead',
        level: 'info',
        message: `Hot lead detected: ${contact.name} (score ${newScore}, ${result.category})`,
        contactId: contact.id,
      },
    })
    // Fire webhook: lead.hot
    void dispatchWebhooks('lead.hot', { contactId: contact.id, leadScore: newScore, category: result.category, threshold: owner.leadThreshold ?? 70 })
  }

  // 14. AI log
  await db.log.create({
    data: {
      category: 'ai',
      level: 'info',
      message: `AI replied to ${contact.name} in ${result.responseMs}ms (model ${result.model})`,
      contactId: contact.id,
      meta: JSON.stringify({ replyLen: result.reply.length, category: result.category }),
    },
  })

  return {
    ok: true,
    contactId: contact.id,
    replyText: result.reply,
    replyMessageId: outgoing.id,
    leadScore: newScore,
    ownerRequested: result.ownerRequested,
    ownerNotified,
    aiSkipped: false,
    sentiment: sentimentLabel,
    sentimentScore: sentimentScoreNum,
    intent: sentimentIntent,
  }
}

// Owner sends a manual message (human takeover path)
export async function sendOwnerMessage(contactId: string, text: string) {
  const msg = await db.message.create({
    data: {
      contactId,
      direction: 'outgoing',
      source: 'owner',
      text,
      status: 'sent',
    },
  })
  await db.contact.update({
    where: { id: contactId },
    data: { lastMessageAt: new Date(), lastSeen: new Date() },
  })
  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `Owner sent manual message to contact ${contactId}`,
      contactId,
    },
  })
  // Fire webhook: message.sent (owner)
  void dispatchWebhooks('message.sent', { contactId, text, source: 'owner', messageId: msg.id })
  return msg
}

export async function setHumanMode(contactId: string, on: boolean) {
  await db.contact.update({ where: { id: contactId }, data: { humanMode: on } })
  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `Human mode ${on ? 'enabled' : 'disabled'} for contact ${contactId}`,
      contactId,
    },
  })
}
