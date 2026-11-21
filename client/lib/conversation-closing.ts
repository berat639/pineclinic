export function isWebConversationFarewell(text: string, customCloseMessage?: string): boolean {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase('tr-TR')
      .replace(/[.,!?;:()[\]{}"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const normalized = normalize(text)
  if (!normalized) return false

  if (customCloseMessage) {
    const customNorm = normalize(customCloseMessage)
    if (customNorm.length >= 10 && normalized.includes(customNorm)) {
      return true
    }
  }

  return [
    /\bhoşça\s*kalın\b/,
    /\bhoşçakalın\b/,
    /\bgüle\s*güle\b/,
    /\biyi\s+(?:günler|akşamlar|geceler)\b/,
    /\bsağlıklı\s+günler\b/,
    /\bkendinize\s+iyi\s+bakın\b/,
    /\bgörüş(?:meyi|memizi)\s+sonlandır/,
    /\bbaşka\s+bir\s+zaman\s+(?:tekrar\s+)?görüş/,
    /\bgörüşmek\s+dileğiyle\b/,
  ].some(pattern => pattern.test(normalized))
}

