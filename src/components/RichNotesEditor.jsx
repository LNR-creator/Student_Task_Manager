import { useState, useRef } from 'react';

/**
 * Parses inline markdown: bold, italic, strikethrough, inline code, and URLs/links
 */
function parseInlineMarkdown(text) {
  if (!text) return null;

  // Pattern splits by:
  // 1. **bold** or __bold__
  // 2. *italic* or _italic_
  // 3. ~~strikethrough~~
  // 4. `code`
  // 5. [label](url)
  // 6. raw http(s) URL
  const tokenRegex = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+(?!\*)\*|(?<!_)_[^_]+(?!_)_|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    const key = `token-${match.index}`;

    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={key} className="notes-inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const closingBracket = token.indexOf('](');
      const label = token.slice(1, closingBracket);
      const url = token.slice(closingBracket + 2, -1);
      parts.push(
        <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="notes-rendered-link">
          {label}
        </a>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      parts.push(
        <a key={key} href={token} target="_blank" rel="noopener noreferrer" className="notes-rendered-link">
          {token}
        </a>
      );
    } else {
      parts.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

/**
 * Parses markdown blocks and renders safe React elements
 */
export function MarkdownRenderer({ content, onToggleTask }) {
  if (!content || !content.trim()) {
    return <div className="notes-empty-preview">No notes added yet. Tap &quot;Write&quot; to add formatted notes.</div>;
  }

  const lines = content.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let activeListType = null; // 'ul' | 'ol' | 'checklist'
  let listItems = [];

  function flushList() {
    if (!activeListType || listItems.length === 0) return;
    const key = `list-${elements.length}`;
    if (activeListType === 'checklist') {
      elements.push(<ul key={key} className="notes-checklist">{listItems}</ul>);
    } else if (activeListType === 'ol') {
      elements.push(<ol key={key} className="notes-ordered-list">{listItems}</ol>);
    } else {
      elements.push(<ul key={key} className="notes-bullet-list">{listItems}</ul>);
    }
    listItems = [];
    activeListType = null;
  }

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();

    // Code block toggle ```
    if (trimmed.startsWith('```')) {
      flushList();
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${elements.length}`} className="notes-code-block">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${lineIndex}`} className="notes-divider" />);
      return;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${lineIndex}`} className="notes-h3">{parseInlineMarkdown(trimmed.slice(4))}</h3>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${lineIndex}`} className="notes-h2">{parseInlineMarkdown(trimmed.slice(3))}</h2>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={`h1-${lineIndex}`} className="notes-h1">{parseInlineMarkdown(trimmed.slice(2))}</h1>);
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`quote-${lineIndex}`} className="notes-quote">
          {parseInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    // Task Checklist: - [ ] or - [x]
    const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      if (activeListType !== 'checklist') {
        flushList();
        activeListType = 'checklist';
      }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const taskText = taskMatch[2];
      listItems.push(
        <li key={`task-${lineIndex}`} className={`notes-task-item ${isChecked ? 'completed' : ''}`}>
          <label className="notes-task-label">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleTask && onToggleTask(lineIndex)}
              className="notes-task-checkbox"
            />
            <span className="notes-task-text">{parseInlineMarkdown(taskText)}</span>
          </label>
        </li>
      );
      return;
    }

    // Bullet points: - or * or •
    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (activeListType !== 'ul') {
        flushList();
        activeListType = 'ul';
      }
      listItems.push(
        <li key={`bullet-${lineIndex}`} className="notes-bullet-item">
          {parseInlineMarkdown(bulletMatch[1])}
        </li>
      );
      return;
    }

    // Numbered list: 1. 2. etc.
    const numberMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numberMatch) {
      if (activeListType !== 'ol') {
        flushList();
        activeListType = 'ol';
      }
      listItems.push(
        <li key={`num-${lineIndex}`} className="notes-numbered-item">
          {parseInlineMarkdown(numberMatch[1])}
        </li>
      );
      return;
    }

    // Empty line
    if (!trimmed) {
      flushList();
      return;
    }

    // Standard Paragraph
    flushList();
    elements.push(
      <p key={`p-${lineIndex}`} className="notes-paragraph">
        {parseInlineMarkdown(line)}
      </p>
    );
  });

  // Final flush
  flushList();
  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key={`code-${elements.length}`} className="notes-code-block">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <div className="notes-rendered-content">{elements}</div>;
}

export function RichNotesEditor({
  id = 'notes-editor',
  value = '',
  onChange,
  placeholder = 'Write notes with bold, headings, points, checklists...'
}) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'
  const textareaRef = useRef(null);

  function applyFormat(formatType) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const currentText = value || '';
    const selected = currentText.substring(start, end);

    let replacement = '';
    let newCursorPos = start;

    switch (formatType) {
      case 'bold':
        replacement = selected ? `**${selected}**` : '**bold text**';
        newCursorPos = selected ? end + 4 : start + 2;
        break;
      case 'italic':
        replacement = selected ? `*${selected}*` : '*italic text*';
        newCursorPos = selected ? end + 2 : start + 1;
        break;
      case 'h1':
        replacement = selected ? `# ${selected}` : '# Heading 1\n';
        newCursorPos = start + (selected ? selected.length + 2 : 12);
        break;
      case 'h2':
        replacement = selected ? `## ${selected}` : '## Heading 2\n';
        newCursorPos = start + (selected ? selected.length + 3 : 13);
        break;
      case 'h3':
        replacement = selected ? `### ${selected}` : '### Heading 3\n';
        newCursorPos = start + (selected ? selected.length + 4 : 14);
        break;
      case 'bullet':
        if (selected) {
          replacement = selected
            .split('\n')
            .map((line) => (line.startsWith('- ') ? line : `- ${line}`))
            .join('\n');
          newCursorPos = start + replacement.length;
        } else {
          replacement = '- Point 1\n- Point 2\n';
          newCursorPos = start + replacement.length;
        }
        break;
      case 'number':
        if (selected) {
          replacement = selected
            .split('\n')
            .map((line, idx) => `${idx + 1}. ${line}`)
            .join('\n');
          newCursorPos = start + replacement.length;
        } else {
          replacement = '1. First point\n2. Second point\n';
          newCursorPos = start + replacement.length;
        }
        break;
      case 'task':
        if (selected) {
          replacement = selected
            .split('\n')
            .map((line) => (line.startsWith('- [ ] ') ? line : `- [ ] ${line}`))
            .join('\n');
          newCursorPos = start + replacement.length;
        } else {
          replacement = '- [ ] Task item\n';
          newCursorPos = start + replacement.length;
        }
        break;
      case 'quote':
        replacement = selected ? `> ${selected}` : '> Important quote\n';
        newCursorPos = start + (selected ? selected.length + 2 : 18);
        break;
      case 'code':
        replacement = selected ? `\`${selected}\`` : '`code`';
        newCursorPos = selected ? end + 2 : start + 1;
        break;
      case 'divider':
        replacement = '\n---\n';
        newCursorPos = start + 5;
        break;
      default:
        return;
    }

    const nextText = currentText.substring(0, start) + replacement + currentText.substring(end);
    onChange(nextText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }

  function handleToggleTask(lineIndex) {
    const lines = (value || '').split('\n');
    const line = lines[lineIndex];
    if (!line) return;

    if (/^\s*-\s*\[\s*\]/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*-\s*\[)\s*(\])/, '$1x$2');
    } else if (/^\s*-\s*\[[xX]\]/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*-\s*\[)[xX](\])/, '$1 $2');
    }

    onChange(lines.join('\n'));
  }

  return (
    <div className="rich-notes-container">
      {/* Top Header with Write / Preview Tabs */}
      <div className="rich-notes-header">
        <div className="rich-notes-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'write'}
            className={`rich-notes-tab ${activeTab === 'write' ? 'active' : ''}`}
            onClick={() => setActiveTab('write')}
          >
            ✏️ Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            className={`rich-notes-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            👁️ Preview
          </button>
        </div>
        <span className="rich-notes-hint">
          {activeTab === 'write' ? 'Markdown enabled' : 'Formatted view'}
        </span>
      </div>

      {/* Mobile-Friendly Formatting Toolbar (Shown in Write Mode) */}
      {activeTab === 'write' && (
        <div className="rich-notes-toolbar" role="toolbar" aria-label="Text Formatting">
          <button
            type="button"
            className="format-btn format-bold"
            title="Bold (**text**)"
            onClick={() => applyFormat('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="format-btn format-italic"
            title="Italic (*text*)"
            onClick={() => applyFormat('italic')}
          >
            <em>I</em>
          </button>
          <div className="toolbar-divider" />
          <button
            type="button"
            className="format-btn format-heading"
            title="Large Heading (# Heading)"
            onClick={() => applyFormat('h1')}
          >
            H1
          </button>
          <button
            type="button"
            className="format-btn format-heading"
            title="Medium Heading (## Heading)"
            onClick={() => applyFormat('h2')}
          >
            H2
          </button>
          <button
            type="button"
            className="format-btn format-heading"
            title="Small Heading (### Heading)"
            onClick={() => applyFormat('h3')}
          >
            H3
          </button>
          <div className="toolbar-divider" />
          <button
            type="button"
            className="format-btn format-list"
            title="Bullet Points (- item)"
            onClick={() => applyFormat('bullet')}
          >
            • Points
          </button>
          <button
            type="button"
            className="format-btn format-list"
            title="Numbered List (1. item)"
            onClick={() => applyFormat('number')}
          >
            1. Number
          </button>
          <button
            type="button"
            className="format-btn format-checklist"
            title="Checklist (- [ ] task)"
            onClick={() => applyFormat('task')}
          >
            ☑ Checklist
          </button>
          <div className="toolbar-divider" />
          <button
            type="button"
            className="format-btn format-quote"
            title="Quote (> quote)"
            onClick={() => applyFormat('quote')}
          >
            ❝ Quote
          </button>
          <button
            type="button"
            className="format-btn format-code"
            title="Inline Code (`code`)"
            onClick={() => applyFormat('code')}
          >
            &lt;/&gt;
          </button>
          <button
            type="button"
            className="format-btn format-divider"
            title="Horizontal Divider (---)"
            onClick={() => applyFormat('divider')}
          >
            ―
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="rich-notes-body">
        {activeTab === 'write' ? (
          <textarea
            id={id}
            ref={textareaRef}
            className="task-notes rich-notes-textarea"
            placeholder={placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={8}
          />
        ) : (
          <div className="rich-notes-preview-pane">
            <MarkdownRenderer content={value} onToggleTask={handleToggleTask} />
          </div>
        )}
      </div>
    </div>
  );
}
