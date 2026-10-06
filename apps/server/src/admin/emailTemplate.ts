interface EmailContent {
  title: string;
  greeting: string;
  paragraphs: string[];
  action?: {label: string; url: string};
  note?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    return (
      {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[
        character
      ] || character
    );
  });

export function accountEmail(content: EmailContent) {
  const {title, greeting, paragraphs, action, note} = content;
  const signature = 'Best regards,\nThe AMCUI team';
  const text = [
    greeting,
    ...paragraphs,
    ...(action ? [`${action.label}:\n${action.url}`] : []),
    ...(note ? [note] : []),
    signature,
  ].join('\n\n');
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f3f5f8;color:#243247;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
  <table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff">
    <tr><td style="padding:24px 32px;background:#1e3a5f;color:#ffffff;font-size:22px;font-weight:bold">AMCUI</td></tr>
    <tr><td style="padding:32px">
      <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3">${escapeHtml(title)}</h1>
      <p>${escapeHtml(greeting)}</p>
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n      ')}
      ${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#1e3a5f;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p><p style="font-size:13px;color:#526174">You can also copy and paste this link into your browser:<br><a href="${escapeHtml(action.url)}" style="color:#1e3a5f;word-break:break-all">${escapeHtml(action.url)}</a></p>` : ''}
      ${note ? `<p style="font-size:14px;color:#526174">${escapeHtml(note)}</p>` : ''}
      <p style="margin-top:28px">Best regards,<br>The AMCUI team</p>
    </td></tr>
  </table>
</body>
</html>`;
  return {text, html};
}
