export const OFFICIAL_MINISTRY_CONSENT_PDF_URL = '/saglik-bakanligi-onam-formu.pdf'
export const OFFICIAL_MINISTRY_CONSENT_FILENAME =
  'TC_Saglik_Bakanligi_Aydinlatilmis_Riza_Belgesi.pdf'

export function printOfficialDentalConsent(): boolean {
  if (typeof window === 'undefined') return false

  const printWin = window.open(OFFICIAL_MINISTRY_CONSENT_PDF_URL, '_blank', 'noopener')
  if (printWin) {
    const triggerPrint = () => {
      try {
        printWin.focus()
        printWin.print()
      } catch {
        // Browser native PDF viewer provides built-in print/download controls
      }
    }
    printWin.addEventListener?.('load', triggerPrint, { once: true })
    setTimeout(triggerPrint, 600)
    return true
  }

  return false
}

export function downloadOfficialDentalConsentPdf(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return OFFICIAL_MINISTRY_CONSENT_FILENAME
  }

  const link = document.createElement('a')
  link.href = OFFICIAL_MINISTRY_CONSENT_PDF_URL
  link.download = OFFICIAL_MINISTRY_CONSENT_FILENAME
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
  }, 1000)

  return OFFICIAL_MINISTRY_CONSENT_FILENAME
}
