import * as mammoth from 'mammoth';
import { prosemirrorToDocx } from './prosemirror-to-docx';
import { attachmentIdFromSrc } from './docx-export.service';
import { DocxImportService } from '../../import/services/docx-import.service';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Назначение' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            {
              type: 'orderedList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'nested' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'bash' },
      content: [{ type: 'text', text: 'echo 1\necho 2' }],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Host' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'IP' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'srv-01' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '10.0.0.1' }] }] },
          ],
        },
      ],
    },
    {
      type: 'callout',
      attrs: { type: 'warning' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'careful' }] }],
    },
    { type: 'image', attrs: { src: '/api/files/x/pic.png', alt: 'pic' } },
    { type: 'someUnknownNode', content: [{ type: 'text', text: 'fallback text' }] },
  ],
};

describe('prosemirrorToDocx', () => {
  it('produces a Word document that keeps structure and text', async () => {
    const buffer = await prosemirrorToDocx(doc as any, {
      title: 'Сервер',
      loadImage: async () => ({ data: PNG, type: 'png' }),
    });
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // zip container

    const { value: html } = await mammoth.convertToHtml({ buffer });
    expect(html).toContain('Сервер');
    expect(html).toMatch(/<h2>Назначение<\/h2>/);
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toMatch(/<ul><li>one<ol><li>nested<\/li><\/ol><\/li><\/ul>/);
    expect(html).toContain('☑ done');
    expect(html).toContain('echo 1');
    expect(html).toContain('echo 2');
    // code keeps a named style so it round-trips through import
    const styled = await mammoth.convertToHtml(
      { buffer },
      { styleMap: ["p[style-name='Code'] => pre:separator('\\n')"] },
    );
    expect(styled.value).toContain('<pre>echo 1\necho 2</pre>');
    expect(html).toMatch(/<table>.*srv-01.*10\.0\.0\.1.*<\/table>/s);
    expect(html).toContain('careful');
    expect(html).toContain('<img');
    expect(html).toContain('fallback text');
  });

  it('handles empty documents', async () => {
    const buffer = await prosemirrorToDocx({ type: 'doc', content: [] });
    const { value } = await mammoth.convertToHtml({ buffer });
    expect(value).toBe('');
  });

  it('renders a placeholder when an image cannot be loaded', async () => {
    const buffer = await prosemirrorToDocx(
      { type: 'doc', content: [{ type: 'image', attrs: { src: '/x.png', alt: 'scheme' } }] },
      { loadImage: async () => null },
    );
    const { value } = await mammoth.convertToHtml({ buffer });
    expect(value).toContain('[scheme]');
  });
});

describe('attachmentIdFromSrc', () => {
  it('extracts ids from relative, absolute and public URLs', () => {
    const id = '01a2082f-88d7-7ca8-b4b6-1f97a919df49';
    expect(attachmentIdFromSrc(`/api/files/${id}/a.png`)).toBe(id);
    expect(attachmentIdFromSrc(`https://x.local/api/files/${id}/a.png?t=1`)).toBe(id);
    expect(attachmentIdFromSrc(`/api/files/public/${id}/a.png`)).toBe(id);
    expect(attachmentIdFromSrc('https://example.com/a.png')).toBeNull();
  });
});

describe('DocxImportService', () => {
  it('converts DOCX to HTML and stores images as page attachments', async () => {
    const docx = await prosemirrorToDocx(doc as any, {
      loadImage: async () => ({ data: PNG, type: 'png' }),
    });

    const uploads: string[] = [];
    const inserted: any[] = [];
    const storage: any = {
      upload: jest.fn(async (path: string) => uploads.push(path)),
    };
    const db: any = {
      insertInto: () => ({
        values: (v: any) => ({ execute: async () => inserted.push(v) }),
      }),
    };
    const service = new DocxImportService(storage, db);

    const html = await service.convertDocxToHtml(docx, 'ws', 'space', 'page', 'user');

    expect(html).toContain('<h2>Назначение</h2>');
    expect(html).toMatch(/<table>/);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^ws\/files\/[0-9a-f-]+\/image-1\.png$/);
    expect(inserted[0]).toMatchObject({
      pageId: 'page',
      spaceId: 'space',
      workspaceId: 'ws',
      creatorId: 'user',
      mimeType: 'image/png',
    });
    expect(html).toContain(`src="/api/files/${inserted[0].id}/image-1.png"`);
  });
});
