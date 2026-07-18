// ============================================================
// Translation lib — detect language + translate text using LLM
// with heuristic fallbacks. Non-blocking: never throws.
// ============================================================
import { db } from '@/lib/db'
import { callOpenRouter } from '@/lib/ai-engine'

// Simple heuristic language detection based on Unicode script ranges
export function detectLanguageHeuristic(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return 'hi' // Devanagari
  if (/[\u0600-\u06FF]/.test(text)) return 'ar' // Arabic
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh' // Chinese
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja' // Japanese
  if (/[\uac00-\ud7af]/.test(text)) return 'ko' // Korean
  if (/[\u0400-\u04FF]/.test(text)) return 'ru' // Cyrillic
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th' // Thai
  // Latin script — check for common Hinglish markers
  const lower = text.toLowerCase()
  const hinglishMarkers = ['hai', 'kya', 'kaise', 'bhai', 'yaar', 'kar', 'chahiye', 'chahta', 'madad', 'bat', 'namaste', 'namaste']
  const hits = hinglishMarkers.filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).length
  if (hits >= 1) return 'hi' // Hinglish — treat as Hindi
  return 'en'
}

export async function detectLanguage(text: string): Promise<string> {
  try {
    const result = await Promise.race([
      callOpenRouter([
        { role: 'system', content: 'Detect the language of this message. Reply with ONLY the ISO 639-1 language code (e.g. en, hi, es, fr, ar, zh, ja, ru, de, pt). Nothing else.' },
        { role: 'user', content: text.slice(0, 500) },
      ], { maxTokens: 5 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ])
    const code = result.content.trim().toLowerCase().slice(0, 5)
    if (/^[a-z]{2}$/.test(code)) return code
    return detectLanguageHeuristic(text)
  } catch {
    return detectLanguageHeuristic(text)
  }
}

export async function translateText(text: string, from: string, to: string): Promise<string> {
  if (from === to || !text.trim()) return text
  try {
    const result = await Promise.race([
      callOpenRouter([
        { role: 'system', content: `Translate this ${from} text to ${to}. Return ONLY the translation, nothing else. No explanations, no notes.` },
        { role: 'user', content: text.slice(0, 1000) },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    return result.content || text
  } catch {
    return text
  }
}

// Get translation settings
export async function getTranslationSettings(): Promise<{ enabled: boolean; targetLanguage: string }> {
  const [enabledSetting, langSetting] = await Promise.all([
    db.setting.findUnique({ where: { key: 'translation_enabled' } }),
    db.setting.findUnique({ where: { key: 'translation_target_lang' } }),
  ])
  return {
    enabled: enabledSetting?.value === 'true',
    targetLanguage: langSetting?.value || 'en',
  }
}
