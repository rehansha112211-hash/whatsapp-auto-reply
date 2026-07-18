// ============================================================
// Seed - populates the DB with default company/owner/AI/auto-reply
// settings and a few realistic demo conversations so the dashboard
// is never empty on first run.
// ============================================================
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/auth'
import { QORVIX_COMPANY, QORVIX_SERVICES } from '@/lib/types'

export async function ensureSeed() {
  await ensureDefaultUser()

  // Company
  const companyExists = await db.company.count()
  if (companyExists === 0) {
    await db.company.create({
      data: {
        id: 'company',
        name: QORVIX_COMPANY.name,
        website: QORVIX_COMPANY.website,
        description: QORVIX_COMPANY.description,
        services: JSON.stringify(QORVIX_SERVICES),
        businessHours: JSON.stringify({
          mon: '09:00-19:00', tue: '09:00-19:00', wed: '09:00-19:00',
          thu: '09:00-19:00', fri: '09:00-19:00', sat: '09:00-14:00', sun: 'closed',
        }),
        greetingMsg:
          "Hi! 👋 Welcome to QorvixNode Technologies. We build custom websites, Android apps, AI automation, CRMs and business software. Tell us what you're looking for and we'll guide you from there.",
        closingMsg: 'Thanks for chatting with QorvixNode Technologies! We will follow up shortly. 🙏',
        supportMsg: 'For urgent support, reply with "talk to owner" and our team will reach out.',
      },
    })
  }

  // Owner
  const ownerExists = await db.owner.count()
  if (ownerExists === 0) {
    await db.owner.create({
      data: {
        id: 'owner',
        name: 'QorvixNode Owner',
        phoneNumber: '+91 90000 00000',
        availability: 'available',
        businessHours: JSON.stringify({ days: 'Mon-Sat', hours: '09:00-19:00', tz: 'Asia/Kolkata' }),
        humanTakeover: true,
        leadNotify: true,
        autoNotify: true,
        leadThreshold: 70,
      },
    })
  }

  // API settings
  const apiExists = await db.apiSetting.count()
  if (apiExists === 0) {
    await db.apiSetting.create({
      data: {
        id: 'api',
        provider: 'zai',
        baseUrl: 'https://api.z.ai/api/paas/v4',
        apiKey: '',
        model: 'glm-4.5',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 512,
        systemPrompt:
          'You are the official WhatsApp AI assistant for QorvixNode Technologies. Be concise, friendly, professional. Reply in the customer language.',
        status: 'untested',
      },
    })
  }

  // Auto reply settings
  const arExists = await db.autoReplySetting.count()
  if (arExists === 0) {
    await db.autoReplySetting.create({
      data: {
        id: 'autoreply',
        enabled: true,
        replyDelaySec: 1,
        typingDelaySec: 2,
        businessHoursOnly: false,
        greeting: "Hi! 👋 Welcome to QorvixNode Technologies — we build websites, apps & AI automation. How can we help?",
        awayMessage: "We're currently away. Leave your requirement and we'll reply during business hours (Mon-Sat 9-7 IST). 🙏",
        maxReplyLength: 600,
        languagePref: 'auto',
      },
    })
  }

  // WhatsApp session
  const sessExists = await db.session.count()
  if (sessExists === 0) {
    await db.session.create({
      data: { id: 'whatsapp', state: 'disconnected' },
    })
  }

  // Demo contacts + conversations (only if none exist)
  const contactsExist = await db.contact.count()
  if (contactsExist === 0) {
    await seedDemoConversations()
  }

  // A few startup logs
  const logsExist = await db.log.count()
  if (logsExist === 0) {
    await db.log.createMany({
      data: [
        { category: 'startup', level: 'info', message: 'Platform initialized - QorvixNode Technologies' },
        { category: 'startup', level: 'info', message: 'Database ready (SQLite)' },
        { category: 'startup', level: 'info', message: 'AI engine loaded (z-ai-web-dev-sdk)' },
        { category: 'startup', level: 'info', message: 'WhatsApp engine idle - awaiting QR login' },
        { category: 'database', level: 'info', message: 'Indexes verified' },
      ],
    })
  }
}

async function seedDemoConversations() {
  const now = Date.now()
  const demos: Array<{
    name: string; phone: string; lang: string; status: string; score: number;
    service: string; human: boolean; pinned: boolean; minsAgo: number;
    messages: Array<{ dir: 'incoming' | 'outgoing'; src: string; text: string; minsAgo: number }>
  }> = [
    {
      name: 'Rahul Sharma', phone: '+91 98765 43210', lang: 'hinglish', status: 'lead', score: 82,
      service: 'website', human: false, pinned: true, minsAgo: 8,
      messages: [
        { dir: 'incoming', src: 'customer', text: 'Hi, mujhe ek e-commerce website chahiye apne business ke liye', minsAgo: 12 },
        { dir: 'outgoing', src: 'ai', text: 'Hi Rahul! 👋 QorvixNode Technologies mein aapka swagat hai. Hum custom e-commerce websites banate hain. Aapka business kis product ke baare mein hai?', minsAgo: 11 },
        { dir: 'incoming', src: 'customer', text: 'Main handmade soaps bechta hoon. Budget around 25k hai', minsAgo: 9 },
        { dir: 'outgoing', src: 'ai', text: 'Bahut achha! 25k mein hum aapko ek professional e-commerce site with payment gateway, cart aur admin panel de sakte hain. Kitne products hain aapke paas?', minsAgo: 8 },
        { dir: 'incoming', src: 'customer', text: 'Around 40 products. Kab tak ready ho sakta hai?', minsAgo: 7 },
        { dir: 'outgoing', src: 'ai', text: '40 products ke liye approx 10-12 working days lagenge. Hum aapko hosting + 1 year support bhi denge. Aapka portfolio website: https://qorvixnodetechnologies.indevs.in', minsAgo: 6 },
      ],
    },
    {
      name: 'Priya Patel', phone: '+91 90000 11111', lang: 'en', status: 'lead', score: 76,
      service: 'app', human: false, pinned: false, minsAgo: 35,
      messages: [
        { dir: 'incoming', src: 'customer', text: 'Hello, I need an Android app for my fitness coaching business', minsAgo: 40 },
        { dir: 'outgoing', src: 'ai', text: "Hi Priya! 👋 Welcome to QorvixNode Technologies. We build native Android apps with booking, payments and content delivery. How many users are you expecting?", minsAgo: 39 },
        { dir: 'incoming', src: 'customer', text: 'Around 500 clients. Need workout videos and diet plans', minsAgo: 37 },
        { dir: 'outgoing', src: 'ai', text: 'Perfect — we can build that with video streaming, subscription plans and client progress tracking. Want me to share our portfolio? https://qorvixnodetechnologies.indevs.in', minsAgo: 36 },
      ],
    },
    {
      name: 'Amit Kumar', phone: '+91 88888 22222', lang: 'hi', status: 'active', score: 45,
      service: 'ai_automation', human: true, pinned: false, minsAgo: 90,
      messages: [
        { dir: 'incoming', src: 'customer', text: 'Namaste, mujhe apne business ke liye AI chatbot chahiye', minsAgo: 95 },
        { dir: 'outgoing', src: 'ai', text: 'नमस्ते! 👋 QorvixNode Technologies में आपका स्वागत है। हम WhatsApp और वेबसाइट के लिए AI ऑटो-रिप्लाई और चैटबॉट बनाते हैं। आपका बिज़नेस किस बारे में है?', minsAgo: 94 },
        { dir: 'incoming', src: 'customer', text: 'Main owner se baat karna chahta hoon', minsAgo: 92 },
        { dir: 'outgoing', src: 'ai', text: 'बिलकुल, मैंने आपका अनुरोध हमारी टीम को भेज दिया है। वे जल्द ही आपसे संपर्क करेंगे। 🙏', minsAgo: 91 },
        { dir: 'outgoing', src: 'owner', text: 'नमस्ते Amit ji, main owner se baat kar raha hoon. Aapka requirement kya hai?', minsAgo: 90 },
      ],
    },
    {
      name: 'Sneha Reddy', phone: '+91 77777 33333', lang: 'en', status: 'new', score: 22,
      service: 'general', human: false, pinned: false, minsAgo: 180,
      messages: [
        { dir: 'incoming', src: 'customer', text: 'Hi, just wanted to know about your services', minsAgo: 182 },
        { dir: 'outgoing', src: 'ai', text: 'Hi Sneha! 👋 QorvixNode Technologies offers custom websites, Android apps, AI automation, CRMs, e-commerce and more. Anything specific you are exploring?', minsAgo: 181 },
      ],
    },
    {
      name: 'Vikram Singh', phone: '+91 99999 44444', lang: 'en', status: 'customer', score: 90,
      service: 'high_priority', human: false, pinned: true, minsAgo: 240,
      messages: [
        { dir: 'incoming', src: 'customer', text: 'I need a CRM + dashboard urgently for my sales team, ready to pay immediately', minsAgo: 245 },
        { dir: 'outgoing', src: 'ai', text: 'Hi Vikram! 👋 Great — we build custom CRMs with dashboards, pipeline tracking and reports. For an urgent project we can fast-track. How many sales reps will use it?', minsAgo: 244 },
        { dir: 'incoming', src: 'customer', text: '15 reps. Need it in 3 weeks. What would be the cost?', minsAgo: 242 },
        { dir: 'outgoing', src: 'ai', text: '15 reps in 3 weeks is doable. Pricing depends on features — shall I connect you with our team for a detailed quote? You can also see past work: https://qorvixnodetechnologies.indevs.in', minsAgo: 241 },
      ],
    },
  ]

  for (const d of demos) {
    const contact = await db.contact.create({
      data: {
        name: d.name, phone: d.phone, language: d.lang, status: d.status,
        leadScore: d.score, detectedService: d.service, humanMode: d.human, pinned: d.pinned,
        firstSeen: new Date(now - d.minsAgo * 60_000 - 3_600_000),
        lastSeen: new Date(now - d.minsAgo * 60_000),
        lastMessageAt: new Date(now - d.minsAgo * 60_000),
        notes: '',
      },
    })
    for (const m of d.messages) {
      await db.message.create({
        data: {
          contactId: contact.id,
          direction: m.dir, source: m.src, text: m.text,
          status: 'read', read: true,
          timestamp: new Date(now - m.minsAgo * 60_000),
        },
      })
    }
    // memory
    await db.conversationMemory.createMany({
      data: [
        { contactId: contact.id, key: 'language', value: d.lang },
        { contactId: contact.id, key: 'last_intent', value: d.service },
        { contactId: contact.id, key: 'name', value: d.name },
      ],
    })
    // lead score history
    await db.leadScore.create({
      data: { contactId: contact.id, score: d.score, category: d.service, reason: 'Seed demo', notified: d.score >= 70 },
    })
  }

  // Notifications
  await db.notification.createMany({
    data: [
      { type: 'new_lead', title: 'New Hot Lead', body: 'Vikram Singh crossed lead threshold (90)', severity: 'success' },
      { type: 'new_lead', title: 'New Hot Lead', body: 'Rahul Sharma crossed lead threshold (82)', severity: 'success' },
      { type: 'owner_request', title: 'Owner Requested', body: 'Amit Kumar asked to speak to a human', severity: 'warning' },
      { type: 'new_customer', title: 'New Customer', body: 'Sneha Reddy sent first message', severity: 'info' },
    ],
  })
}
