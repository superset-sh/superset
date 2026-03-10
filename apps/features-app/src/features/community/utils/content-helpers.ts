/**
 * Content parsing utilities for TipTap rich text editor
 * Handles extraction of plain text from TipTap JSON and content type detection
 */

/**
 * Recursively extracts text from TipTap JSON nodes
 * @param nodes - Array of TipTap nodes
 * @returns Concatenated text from all nodes
 */
function extractTextFromNodes(nodes: any[]): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.text) return node.text;
      if (node.content) return extractTextFromNodes(node.content);
      return '';
    })
    .join(' ')
    .trim();
}

/**
 * Extracts plain text from TipTap JSON content
 * Falls back to treating input as plain text if JSON parsing fails
 * @param content - TipTap JSON string or plain text
 * @param maxLength - Maximum length of returned text (default: 200)
 * @returns Plain text string, truncated to maxLength
 */
export function extractPlainText(content: string, maxLength = 200): string {
  if (!content) return '';
  try {
    const json = JSON.parse(content);
    return extractTextFromNodes(json.content).slice(0, maxLength);
  } catch {
    return content.slice(0, maxLength);
  }
}

/**
 * Determines if content is TipTap rich text JSON
 * @param content - Content string to check
 * @returns True if content is valid TipTap JSON, false otherwise
 */
export function isRichContent(content: string): boolean {
  if (!content) return false;
  try {
    const json = JSON.parse(content);
    return json.type === 'doc' && Array.isArray(json.content);
  } catch {
    return false;
  }
}
