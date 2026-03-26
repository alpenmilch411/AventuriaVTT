/**
 * Simple markdown-to-JSX renderer. No external dependencies.
 * Supports: h2, h3, paragraphs, bold, italic, inline code, code blocks,
 * bullet lists (nested), numbered lists, tables, horizontal rules,
 * links, and blockquotes.
 */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function parseInline(text) {
  const tokens = []
  let i = 0

  while (i < text.length) {
    // inline code
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        tokens.push(
          <code key={i} className="bg-dsa-bg-dark px-1.5 py-0.5 rounded text-dsa-gold text-xs font-mono">
            {text.slice(i + 1, end)}
          </code>
        )
        i = end + 1
        continue
      }
    }

    // bold **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        tokens.push(
          <strong key={i} className="text-dsa-parchment font-semibold">
            {text.slice(i + 2, end)}
          </strong>
        )
        i = end + 2
        continue
      }
    }

    // italic *text*
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && text[end + 1] !== '*') {
        tokens.push(<em key={i}>{text.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }

    // links [text](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i)
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2)
        if (closeParen !== -1) {
          const linkText = text.slice(i + 1, closeBracket)
          const url = text.slice(closeBracket + 2, closeParen)
          tokens.push(
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dsa-gold hover:text-dsa-gold-light underline"
            >
              {linkText}
            </a>
          )
          i = closeParen + 1
          continue
        }
      }
    }

    // plain text — consume until next special char
    let end = i + 1
    while (end < text.length && !'*`['.includes(text[end])) {
      end++
    }
    tokens.push(text.slice(i, end))
    i = end
  }

  return tokens
}

function parseTable(lines) {
  if (lines.length < 2) return null

  const parseRow = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())

  const headers = parseRow(lines[0])
  // lines[1] is the separator row (---), skip it
  const rows = lines.slice(2).map(parseRow)

  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="bg-dsa-bg-dark text-dsa-gold px-3 py-2 text-left font-semibold">
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-dsa-bg-medium text-dsa-parchment-dark px-3 py-2">
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseListItems(lines, startIndex, indent = 0) {
  const items = []
  let i = startIndex

  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.replace(/^\s*/, '')
    const currentIndent = line.length - stripped.length

    // If we've dedented past our level, stop
    if (currentIndent < indent && stripped.length > 0) break

    // Check if this is a list item at our indent level
    const bulletMatch = stripped.match(/^[-*]\s+(.*)/)
    const numberMatch = stripped.match(/^\d+\.\s+(.*)/)

    if ((bulletMatch || numberMatch) && currentIndent === indent) {
      const content = bulletMatch ? bulletMatch[1] : numberMatch[1]
      // Check if next lines are nested
      const subResult = parseListItems(lines, i + 1, indent + 2)
      items.push({
        content,
        children: subResult.items,
        isOrdered: !!numberMatch,
      })
      i = subResult.nextIndex
    } else if (currentIndent > indent && (stripped.match(/^[-*]\s+/) || stripped.match(/^\d+\.\s+/))) {
      // Nested list — handled by parent call
      break
    } else {
      break
    }
  }

  return { items, nextIndex: i }
}

function renderListItems(items) {
  if (items.length === 0) return null

  const isOrdered = items[0].isOrdered
  const Tag = isOrdered ? 'ol' : 'ul'
  const listClass = isOrdered
    ? 'list-decimal ml-4 text-sm text-dsa-parchment-dark mb-3 space-y-1'
    : 'list-disc ml-4 text-sm text-dsa-parchment-dark mb-3 space-y-1'

  return (
    <Tag className={listClass}>
      {items.map((item, i) => (
        <li key={i}>
          {parseInline(item.content)}
          {item.children.length > 0 && renderListItems(item.children)}
        </li>
      ))}
    </Tag>
  )
}

export default function MarkdownRenderer({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Code block ```
    if (line.trim().startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre key={elements.length} className="bg-dsa-bg-dark p-4 rounded mb-4 text-xs font-mono text-dsa-parchment overflow-x-auto">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<hr key={elements.length} className="border-dsa-bg-medium my-6" />)
      i++
      continue
    }

    // h2
    if (line.startsWith('## ')) {
      const text = line.slice(3).trim()
      elements.push(
        <h2
          key={elements.length}
          id={slugify(text)}
          className="text-xl font-display font-bold text-dsa-gold mt-8 mb-3"
        >
          {parseInline(text)}
        </h2>
      )
      i++
      continue
    }

    // h3
    if (line.startsWith('### ')) {
      const text = line.slice(4).trim()
      elements.push(
        <h3
          key={elements.length}
          id={slugify(text)}
          className="text-lg font-semibold text-dsa-parchment mt-6 mb-2"
        >
          {parseInline(text)}
        </h3>
      )
      i++
      continue
    }

    // Table
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const table = parseTable(tableLines)
      if (table) {
        elements.push(<div key={elements.length}>{table}</div>)
      }
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      const quoteLines = []
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].trimStart().slice(2))
        i++
      }
      elements.push(
        <blockquote key={elements.length} className="border-l-2 border-dsa-gold/30 pl-4 italic text-dsa-parchment-dark mb-3">
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="mb-1">{parseInline(ql)}</p>
          ))}
        </blockquote>
      )
      continue
    }

    // Bullet or numbered list
    const stripped = line.replace(/^\s*/, '')
    if (stripped.match(/^[-*]\s+/) || stripped.match(/^\d+\.\s+/)) {
      const indent = line.length - stripped.length
      const result = parseListItems(lines, i, indent)
      const listEl = renderListItems(result.items)
      if (listEl) {
        elements.push(<div key={elements.length}>{listEl}</div>)
      }
      i = result.nextIndex
      continue
    }

    // Paragraph (collect consecutive non-empty non-special lines)
    const paraLines = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('## ') &&
      !lines[i].startsWith('### ') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trimStart().startsWith('> ') &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\*\*\*+$/.test(lines[i].trim()) &&
      !lines[i].replace(/^\s*/, '').match(/^[-*]\s+/) &&
      !lines[i].replace(/^\s*/, '').match(/^\d+\.\s+/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={elements.length} className="text-sm text-dsa-parchment-dark mb-3 leading-relaxed">
          {parseInline(paraLines.join(' '))}
        </p>
      )
    }
  }

  return <div>{elements}</div>
}

/**
 * Extract h2 and h3 headings from markdown content for Table of Contents.
 */
export function extractHeadings(content) {
  if (!content) return []
  const headings = []
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('### ')) {
      const text = line.slice(4).trim()
      headings.push({ level: 3, text, id: slugify(text) })
    } else if (line.startsWith('## ')) {
      const text = line.slice(3).trim()
      headings.push({ level: 2, text, id: slugify(text) })
    }
  }
  return headings
}
