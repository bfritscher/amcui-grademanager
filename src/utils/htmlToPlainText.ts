export default function htmlToPlaintext(text: string): string {
  return String(text)
    .replace(/<[^>]+>/gm, '')
    .replace(/&nbsp;/gm, ' ');
}
