export default function htmlToPlaintext(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text).replace(/<[^>]+>/gm, '');
  return textarea.value;
}
