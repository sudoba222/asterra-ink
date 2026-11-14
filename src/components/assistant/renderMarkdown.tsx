import * as React from 'react';

/** Minimal, dependency-free renderer: paragraphs, bullet/numbered lists, **bold**, pipe tables. No raw HTML is ever injected. */
const inline = (s: string): React.ReactNode[] =>
  s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));

export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div className="asterra-ai__table-wrap" key={out.length}>
          <table>
            <thead><tr>{head.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, a) => <tr key={a}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, '')); i++; }
      const Tag = ordered ? 'ol' : 'ul';
      out.push(<Tag key={out.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</Tag>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !ul.test(lines[i]) && !ol.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
  }
  return out;
}
