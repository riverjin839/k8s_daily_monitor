interface RichContentProps {
  content: string;
  className?: string;
}

/**
 * Renders HTML content produced by RichTextEditor.
 * Falls back gracefully for plain-text legacy content.
 */
export function RichContent({ content, className = '' }: RichContentProps) {
  if (!content) return null;

  const isHtml = /<[a-z][\s\S]*>/i.test(content);

  if (isHtml) {
    return (
      <div
        className={`rich-content text-sm leading-relaxed ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Plain-text legacy content
  return (
    <p className={`text-sm whitespace-pre-wrap break-words ${className}`}>{content}</p>
  );
}
