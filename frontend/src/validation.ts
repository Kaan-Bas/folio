export function validatePdf(file: File, maxMb: number): string | null {
  if (
    !file.name.toLowerCase().endsWith('.pdf') ||
    !['', 'application/pdf', 'application/octet-stream'].includes(file.type)
  ) {
    return 'Kies een PDF-bestand met de extensie .pdf.'
  }
  if (file.size === 0) return 'Dit bestand is leeg. Kies een PDF met tekst.'
  if (file.size > maxMb * 1024 * 1024) return `De PDF mag maximaal ${maxMb} MB groot zijn.`
  return null
}
