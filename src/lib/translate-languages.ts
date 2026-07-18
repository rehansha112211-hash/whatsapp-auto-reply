// ============================================================
// Translation language metadata — client-safe (no server-only
// imports). Shared by the chat UI (language badges, settings
// dropdown) and the server-side translate.ts (so flag/label
// lookups stay consistent).
// ============================================================

export const LANGUAGE_LABELS: Record<string, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  hi: { label: 'Hindi', flag: '🇮🇳' },
  hinglish: { label: 'Hinglish', flag: '🇮🇳' },
  bn: { label: 'Bengali', flag: '🇧🇩' },
  pa: { label: 'Punjabi', flag: '🇮🇳' },
  gu: { label: 'Gujarati', flag: '🇮🇳' },
  ta: { label: 'Tamil', flag: '🇮🇳' },
  te: { label: 'Telugu', flag: '🇮🇳' },
  kn: { label: 'Kannada', flag: '🇮🇳' },
  ml: { label: 'Malayalam', flag: '🇮🇳' },
  es: { label: 'Spanish', flag: '🇪🇸' },
  fr: { label: 'French', flag: '🇫🇷' },
  de: { label: 'German', flag: '🇩🇪' },
  it: { label: 'Italian', flag: '🇮🇹' },
  pt: { label: 'Portuguese', flag: '🇵🇹' },
  ar: { label: 'Arabic', flag: '🇸🇦' },
  he: { label: 'Hebrew', flag: '🇮🇱' },
  ru: { label: 'Russian', flag: '🇷🇺' },
  uk: { label: 'Ukrainian', flag: '🇺🇦' },
  zh: { label: 'Chinese', flag: '🇨🇳' },
  ja: { label: 'Japanese', flag: '🇯🇵' },
  ko: { label: 'Korean', flag: '🇰🇷' },
  th: { label: 'Thai', flag: '🇹🇭' },
  vi: { label: 'Vietnamese', flag: '🇻🇳' },
  id: { label: 'Indonesian', flag: '🇮🇩' },
  ms: { label: 'Malay', flag: '🇲🇾' },
  tr: { label: 'Turkish', flag: '🇹🇷' },
  pl: { label: 'Polish', flag: '🇵🇱' },
  nl: { label: 'Dutch', flag: '🇳🇱' },
  sv: { label: 'Swedish', flag: '🇸🇪' },
}

export function languageLabel(code: string): { label: string; flag: string } {
  if (!code) return { label: '—', flag: '🌐' }
  return LANGUAGE_LABELS[code] ?? { label: code.toUpperCase(), flag: '🌐' }
}

// Curated list of target languages for the settings dropdown.
export const TARGET_LANGUAGES: { value: string; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { value: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { value: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { value: 'ru', label: 'Russian', flag: '🇷🇺' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'ko', label: 'Korean', flag: '🇰🇷' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { value: 'id', label: 'Indonesian', flag: '🇮🇩' },
  { value: 'vi', label: 'Vietnamese', flag: '🇻🇳' },
  { value: 'th', label: 'Thai', flag: '🇹🇭' },
]
