import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { imageSize } from 'image-size';

/** Minimal ProseMirror JSON node shape. */
export interface PMNode {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
}

export interface LoadedImage {
  data: Buffer;
  /** docx supports raster images only */
  type: 'png' | 'jpg' | 'gif' | 'bmp';
}

export interface DocxBuildOptions {
  title?: string;
  /** Resolves an image src to bytes; return null to render a placeholder. */
  loadImage?: (src: string) => Promise<LoadedImage | null>;
  /** Base URL used to turn relative links into absolute ones. */
  baseUrl?: string;
}

const MAX_IMAGE_WIDTH_PX = 600;
const CODE_FONT = 'Consolas';
const BULLET_REF = 'docmost-bullets';
const ORDERED_REF = 'docmost-numbers';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const CALLOUT_COLORS: Record<string, string> = {
  info: 'E7F1FD',
  note: 'E7F1FD',
  success: 'E6F6EC',
  warning: 'FFF4DB',
  danger: 'FDE8E8',
  default: 'F1F3F5',
};

type Block = Paragraph | Table;

interface Ctx {
  opts: DocxBuildOptions;
  /** numbering instance counter so each ordered list restarts at 1 */
  nextListInstance: number;
}

interface ParaStyle {
  numbering?: { reference: string; level: number; instance?: number };
  indentLevel?: number;
  shading?: string;
  leftBorder?: string;
  code?: boolean;
}

function hexColor(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const m = value.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return undefined;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return hex.toUpperCase();
}

function absoluteUrl(href: string, baseUrl?: string): string {
  try {
    return new URL(href, baseUrl || 'http://localhost').href;
  } catch {
    return href;
  }
}

/** Text of a node and its descendants (used for atoms and fallbacks). */
export function plainText(node: PMNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(plainText).join('');
}

function textRun(
  text: string,
  marks: PMNode['marks'] = [],
  extra: { code?: boolean } = {},
): TextRun {
  const has = (t: string) => marks.some((m) => m.type === t);
  const color = hexColor(marks.find((m) => m.type === 'textStyle')?.attrs?.color);
  const highlight = marks.find((m) => m.type === 'highlight');
  const isCode = extra.code || has('code');
  return new TextRun({
    text,
    bold: has('bold') || undefined,
    italics: has('italic') || undefined,
    underline: has('underline') ? {} : undefined,
    strike: has('strike') || undefined,
    superScript: has('superscript') || undefined,
    subScript: has('subscript') || undefined,
    font: isCode ? CODE_FONT : undefined,
    color,
    shading: highlight
      ? {
          type: ShadingType.CLEAR,
          color: 'auto',
          fill: hexColor(highlight.attrs?.color) ?? 'FFF59D',
        }
      : isCode && !extra.code
        ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F3F5' }
        : undefined,
  });
}

async function inlineChildren(
  nodes: PMNode[] | undefined,
  ctx: Ctx,
  extra: { code?: boolean } = {},
): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'text': {
        const link = node.marks?.find((m) => m.type === 'link');
        const run = textRun(node.text ?? '', node.marks, extra);
        if (link?.attrs?.href) {
          out.push(
            new ExternalHyperlink({
              link: absoluteUrl(link.attrs.href, ctx.opts.baseUrl),
              children: [
                new TextRun({
                  text: node.text ?? '',
                  style: 'Hyperlink',
                  bold: node.marks?.some((m) => m.type === 'bold') || undefined,
                  italics:
                    node.marks?.some((m) => m.type === 'italic') || undefined,
                }),
              ],
            }),
          );
        } else {
          out.push(run);
        }
        break;
      }
      case 'hardBreak':
        out.push(new TextRun({ break: 1 }));
        break;
      case 'mention':
        out.push(
          new TextRun({
            text: `@${node.attrs?.label ?? ''}`,
            color: '1C7ED6',
          }),
        );
        break;
      case 'mathInline':
        out.push(
          new TextRun({ text: node.attrs?.text ?? plainText(node), font: CODE_FONT }),
        );
        break;
      case 'image': {
        const img = await imageRun(node, ctx);
        if (img) out.push(img);
        break;
      }
      default: {
        const text =
          plainText(node) ||
          node.attrs?.label ||
          node.attrs?.text ||
          node.attrs?.name ||
          '';
        if (text) out.push(new TextRun({ text: String(text) }));
      }
    }
  }
  return out;
}

async function imageRun(node: PMNode, ctx: Ctx): Promise<ImageRun | null> {
  const src: string | undefined = node.attrs?.src;
  if (!src || !ctx.opts.loadImage) return null;
  let image: LoadedImage | null = null;
  try {
    image = await ctx.opts.loadImage(src);
  } catch {
    image = null;
  }
  if (!image) return null;

  let width = 400;
  let height = 300;
  try {
    const size = imageSize(image.data);
    if (size.width && size.height) {
      width = size.width;
      height = size.height;
    }
  } catch {
    // keep defaults
  }

  // honor an explicit pixel width from the editor, then cap to page width
  const attrWidth = Number(String(node.attrs?.width ?? '').replace('px', ''));
  const targetWidth = Math.min(
    attrWidth > 0 ? attrWidth : width,
    MAX_IMAGE_WIDTH_PX,
  );
  const scale = targetWidth / width;

  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
    altText: node.attrs?.alt
      ? { name: 'image', title: node.attrs.alt, description: node.attrs.alt }
      : undefined,
  });
}

function paragraph(
  children: ParagraphChild[],
  style: ParaStyle,
  extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {},
): Paragraph {
  return new Paragraph({
    children,
    numbering: style.numbering,
    indent:
      !style.numbering && style.indentLevel
        ? { left: 360 * style.indentLevel }
        : undefined,
    shading: style.shading
      ? { type: ShadingType.CLEAR, color: 'auto', fill: style.shading }
      : undefined,
    border: style.leftBorder
      ? {
          left: {
            style: BorderStyle.SINGLE,
            size: 18,
            color: style.leftBorder,
            space: 8,
          },
        }
      : undefined,
    ...(extra as object),
  });
}

async function blocks(
  nodes: PMNode[] | undefined,
  ctx: Ctx,
  style: ParaStyle = {},
): Promise<Block[]> {
  const out: Block[] = [];
  for (const node of nodes ?? []) {
    out.push(...(await block(node, ctx, style)));
  }
  return out;
}

async function listItems(
  list: PMNode,
  ctx: Ctx,
  style: ParaStyle,
  kind: 'bullet' | 'ordered' | 'task',
): Promise<Block[]> {
  const level = style.numbering ? style.numbering.level + 1 : 0;
  const instance =
    kind === 'ordered' ? ctx.nextListInstance++ : undefined;
  const out: Block[] = [];

  for (const item of list.content ?? []) {
    const [first, ...rest] = item.content ?? [];
    const itemStyle: ParaStyle = {
      ...style,
      numbering:
        kind === 'task'
          ? undefined
          : {
              reference: kind === 'ordered' ? ORDERED_REF : BULLET_REF,
              level: Math.min(level, 8),
              instance,
            },
      indentLevel: kind === 'task' ? (style.indentLevel ?? 0) + 1 : undefined,
    };

    const prefix =
      kind === 'task'
        ? [new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' })]
        : [];

    if (first?.type === 'paragraph' || first?.type === 'heading') {
      out.push(
        paragraph(
          [...prefix, ...(await inlineChildren(first.content, ctx))],
          itemStyle,
        ),
      );
    } else if (first) {
      out.push(paragraph(prefix, itemStyle));
      out.push(...(await block(first, ctx, itemStyle)));
    }

    // nested content (sub-lists, extra paragraphs) continues under the item
    for (const child of rest) {
      const nestedStyle: ParaStyle = {
        ...style,
        numbering: itemStyle.numbering,
        indentLevel: (style.indentLevel ?? 0) + 1,
      };
      if (['bulletList', 'orderedList', 'taskList'].includes(child.type)) {
        out.push(...(await block(child, ctx, nestedStyle)));
      } else {
        out.push(
          ...(await block(child, ctx, {
            ...style,
            indentLevel: (style.indentLevel ?? 0) + level + 1,
          })),
        );
      }
    }
  }
  return out;
}

async function table(node: PMNode, ctx: Ctx): Promise<Table> {
  const rows = (node.content ?? []).map(async (row) => {
    const cells = (row.content ?? []).map(async (cell) => {
      const isHeader = cell.type === 'tableHeader';
      let children = await blocks(cell.content, ctx);
      if (!children.length) children = [new Paragraph('')];
      return new TableCell({
        children,
        columnSpan: cell.attrs?.colspan > 1 ? cell.attrs.colspan : undefined,
        rowSpan: cell.attrs?.rowspan > 1 ? cell.attrs.rowspan : undefined,
        shading: isHeader
          ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F3F5' }
          : cell.attrs?.backgroundColor
            ? {
                type: ShadingType.CLEAR,
                color: 'auto',
                fill: hexColor(cell.attrs.backgroundColor) ?? 'FFFFFF',
              }
            : undefined,
      });
    });
    return new TableRow({ children: await Promise.all(cells) });
  });

  return new Table({
    rows: await Promise.all(rows),
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

async function block(
  node: PMNode,
  ctx: Ctx,
  style: ParaStyle = {},
): Promise<Block[]> {
  switch (node.type) {
    case 'paragraph':
      return [paragraph(await inlineChildren(node.content, ctx), style)];

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      return [
        paragraph(await inlineChildren(node.content, ctx), style, {
          heading: HEADINGS[level - 1],
        }),
      ];
    }

    case 'bulletList':
      return listItems(node, ctx, style, 'bullet');
    case 'orderedList':
      return listItems(node, ctx, style, 'ordered');
    case 'taskList':
      return listItems(node, ctx, style, 'task');

    case 'blockquote':
      return blocks(node.content, ctx, {
        ...style,
        leftBorder: 'ADB5BD',
        indentLevel: (style.indentLevel ?? 0) + 1,
      });

    case 'callout':
      return blocks(node.content, ctx, {
        ...style,
        shading:
          CALLOUT_COLORS[node.attrs?.type] ?? CALLOUT_COLORS.default,
        leftBorder: '868E96',
      });

    case 'codeBlock': {
      const lines = plainText(node).split('\n');
      return lines.map((line) =>
        paragraph(
          [new TextRun({ text: line || ' ' })],
          { ...style, shading: 'F1F3F5' },
          // named style so Word users (and our importer) see it as code
          { style: 'Code' },
        ),
      );
    }

    case 'mathBlock':
      return [
        paragraph(
          [new TextRun({ text: node.attrs?.text ?? plainText(node), font: CODE_FONT })],
          style,
          { alignment: AlignmentType.CENTER },
        ),
      ];

    case 'horizontalRule':
      return [
        new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CED4DA', space: 1 },
          },
        }),
      ];

    case 'pageBreak':
      return [new Paragraph({ children: [], pageBreakBefore: true })];

    case 'image': {
      const img = await imageRun(node, ctx);
      const caption = node.attrs?.caption || node.attrs?.title;
      const out: Block[] = [];
      if (img) {
        out.push(
          paragraph([img], style, {
            alignment:
              node.attrs?.align === 'left'
                ? AlignmentType.LEFT
                : node.attrs?.align === 'right'
                  ? AlignmentType.RIGHT
                  : AlignmentType.CENTER,
          }),
        );
      } else if (node.attrs?.src) {
        out.push(
          paragraph([new TextRun({ text: `[${node.attrs?.alt || 'image'}]`, italics: true })], style),
        );
      }
      if (caption) {
        out.push(
          paragraph([new TextRun({ text: caption, italics: true, size: 18 })], style, {
            alignment: AlignmentType.CENTER,
          }),
        );
      }
      return out;
    }

    case 'table':
      return [await table(node, ctx), new Paragraph('')];

    case 'details': {
      const summary = node.content?.find((c) => c.type === 'detailsSummary');
      const body = node.content?.find((c) => c.type === 'detailsContent');
      return [
        paragraph(
          [new TextRun({ text: '▸ ' }), ...(await inlineChildren(summary?.content, ctx))],
          style,
          {},
        ),
        ...(await blocks(body?.content, ctx, {
          ...style,
          indentLevel: (style.indentLevel ?? 0) + 1,
        })),
      ];
    }

    // containers whose children are regular blocks
    case 'columns':
    case 'column':
    case 'tabs':
    case 'tab':
    case 'tabPanel':
    case 'transclusionSource':
    case 'detailsContent':
      return blocks(node.content, ctx, style);

    case 'attachment':
    case 'pdf':
    case 'video':
    case 'audio':
    case 'embed':
    case 'drawio':
    case 'excalidraw': {
      const url = node.attrs?.url || node.attrs?.src;
      const label = node.attrs?.name || node.attrs?.title || node.type;
      if (!url) return [];
      return [
        paragraph(
          [
            new ExternalHyperlink({
              link: absoluteUrl(url, ctx.opts.baseUrl),
              children: [new TextRun({ text: `📎 ${label}`, style: 'Hyperlink' })],
            }),
          ],
          style,
        ),
      ];
    }

    default: {
      // unknown block: keep any nested blocks, otherwise its text
      if (node.content?.some((c) => c.type !== 'text')) {
        return blocks(node.content, ctx, style);
      }
      const text = plainText(node);
      return text ? [paragraph([new TextRun(text)], style)] : [];
    }
  }
}

function numberingLevels(ordered: boolean) {
  const bullets = ['•', '◦', '▪'];
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : bullets[level % bullets.length],
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
    },
  }));
}

/** Converts a ProseMirror document into a .docx file buffer. */
export async function prosemirrorToDocx(
  doc: PMNode | null | undefined,
  opts: DocxBuildOptions = {},
): Promise<Buffer> {
  const ctx: Ctx = { opts, nextListInstance: 1 };
  const children: Block[] = [];

  if (opts.title) {
    children.push(new Paragraph({ text: opts.title, heading: HeadingLevel.TITLE }));
  }
  children.push(...(await blocks(doc?.content, ctx)));
  if (!children.length) children.push(new Paragraph(''));

  const document = new Document({
    creator: 'Docmost',
    title: opts.title,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
      paragraphStyles: [
        {
          id: 'Code',
          name: 'Code',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: CODE_FONT, size: 20 },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      ],
    },
    numbering: {
      config: [
        { reference: BULLET_REF, levels: numberingLevels(false) },
        { reference: ORDERED_REF, levels: numberingLevels(true) },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(document);
}
