import fs from 'fs-extra';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import * as Y from 'yjs';
import {
  readExam,
  contentFields,
  referencesTo,
  patchEntity,
  putEntity,
  type Graphics,
  type Code,
} from '@amcui/exam-core';
import {ExamDocuments} from './documents.js';
import {resolveThumbnail} from './thumbnails.js';

export type Owner = {entityId: string; field: 'content' | 'answer'};
function validateGraphic(bytes: Buffer, mime: string): void {
  if (
    mime === 'image/png' &&
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error('INVALID_GRAPHICS_DATA');
  if (
    mime === 'image/jpeg' &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    throw new Error('INVALID_GRAPHICS_DATA');
  if (mime === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new Error('INVALID_GRAPHICS_DATA');
  if (mime !== 'image/svg+xml') return;
  const source = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source))
    throw new Error('UNSAFE_SVG');
  const dom = new JSDOM(source, {contentType: 'image/svg+xml'});
  const local = (value: string) =>
    value.startsWith('#') ||
    /^data:(image\/(png|jpeg)|font\/(woff2?|ttf)|application\/font-woff);base64,[a-z\d+/=]+$/i.test(
      value,
    );
  try {
    if (dom.window.document.documentElement.localName !== 'svg')
      throw new Error('INVALID_SVG');
    for (const node of dom.window.document.querySelectorAll('*')) {
      if (
        [
          'script',
          'foreignobject',
          'iframe',
          'object',
          'embed',
          'animate',
          'set',
          'animatemotion',
          'animatetransform',
        ].includes(node.localName.toLowerCase())
      )
        throw new Error('UNSAFE_SVG');
      const css =
        node.localName === 'style'
          ? node.textContent || ''
          : node.getAttribute('style') || '';
      if (/\\|@import/i.test(css)) throw new Error('UNSAFE_SVG');
      for (const attribute of node.attributes) {
        if (
          /^on/i.test(attribute.localName) ||
          (['href', 'src'].includes(attribute.localName) &&
            !local(attribute.value))
        )
          throw new Error('UNSAFE_SVG');
      }
      for (const value of [css, ...[...node.attributes].map((a) => a.value)]) {
        for (const match of value.matchAll(
          /url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi,
        ))
          if (!local(match[1])) throw new Error('UNSAFE_SVG');
      }
    }
  } finally {
    dom.window.close();
  }
}
export class ExamAssets {
  constructor(
    private root: string,
    private thumbnail: (
      folder: string,
      filename: string,
      id: string,
    ) => Promise<void>,
    private svgToPdf: (data: Buffer) => Promise<Buffer>,
  ) {}
  private folder(project: string) {
    ExamDocuments.projectName(project);
    return path.join(this.root, project, 'src', 'graphics');
  }
  private safeId(id: string) {
    if (!/^[\w-]{1,200}$/.test(id)) throw new Error('INVALID_ASSET_ID');
    return id;
  }
  private owner(doc: Y.Doc, owner: Owner) {
    const kind = (['sections', 'questions', 'answers'] as const).find((kind) =>
      doc.getMap(kind).has(owner.entityId),
    );
    if (!kind || (owner.field === 'answer' && kind !== 'questions'))
      throw new Error('NOT_FOUND: content owner');
    const item = doc.getMap<Y.Map<unknown>>(kind).get(owner.entityId)!;
    return {kind, html: String(item.get(owner.field) || '')};
  }
  codeBlocks(doc: Y.Doc) {
    const exam = readExam(doc);
    return contentFields(exam).flatMap((owner) => {
      const dom = new JSDOM(owner.content);
      const blocks = [
        ...dom.window.document.querySelectorAll('code[id],pre[id]'),
      ].map((node) => {
        for (const br of node.querySelectorAll('br')) br.replaceWith('\n');
        const legacy = !node.hasAttribute('data-border')
          ? exam.codes[node.id]
          : undefined;
        return {
          id: node.id,
          entityId: owner.entityId,
          field: owner.field,
          content: legacy?.content ?? (node.textContent || ''),
          mode: legacy?.mode ?? node.getAttribute('data-language') ?? '',
          border: legacy?.border ?? node.getAttribute('data-border') === 'true',
          numbers:
            legacy?.numbers ?? node.getAttribute('data-numbers') === 'true',
          legacy: !!legacy,
        };
      });
      dom.window.close();
      return blocks;
    });
  }
  upsertCode(
    doc: Y.Doc,
    owner: Owner,
    input: Partial<Code> & {content: string},
  ) {
    const target = this.owner(doc, owner);
    const id = this.safeId(input.id || `code${randomUUID()}`);
    const dom = new JSDOM(target.html);
    const document = dom.window.document;
    try {
      const existing = [...document.querySelectorAll('code[id],pre[id]')].find(
        (el) => el.id === id,
      );
      if (input.id && !existing) throw new Error('NOT_FOUND: code block');
      if (
        existing &&
        !existing.hasAttribute('data-border') &&
        doc.getMap('codes').has(id)
      ) {
        patchEntity(doc, 'codes', id, input);
      } else {
        const node = existing || document.createElement('code');
        node.id = id;
        node.classList.add('le__code');
        node.textContent = input.content;
        node.setAttribute(
          'data-border',
          String(input.border ?? node.getAttribute('data-border') !== 'false'),
        );
        node.setAttribute(
          'data-numbers',
          String(input.numbers ?? node.getAttribute('data-numbers') === 'true'),
        );
        node.setAttribute(
          'data-language',
          input.mode ?? node.getAttribute('data-language') ?? 'javascript',
        );
        node.setAttribute(
          'data-highlight-language',
          node.getAttribute('data-language')!,
        );
        if (!existing) document.body.append(node);
        patchEntity(doc, target.kind, owner.entityId, {
          [owner.field]: document.body.innerHTML,
        });
      }
      return this.codeBlocks(doc).find(
        (block) =>
          block.id === id &&
          block.entityId === owner.entityId &&
          block.field === owner.field,
      );
    } finally {
      dom.window.close();
    }
  }
  deleteCode(doc: Y.Doc, owner: Owner, id: string) {
    this.safeId(id);
    const target = this.owner(doc, owner);
    const dom = new JSDOM(target.html);
    try {
      const node = [
        ...dom.window.document.querySelectorAll('code[id],pre[id]'),
      ].find((node) => node.id === id);
      if (!node) throw new Error('NOT_FOUND: code block');
      node.remove();
      doc.transact(() => {
        patchEntity(doc, target.kind, owner.entityId, {
          [owner.field]: dom.window.document.body.innerHTML,
        });
        if (!referencesTo(readExam(doc), id).length)
          doc.getMap('codes').delete(id);
      });
      return {deleted: id};
    } finally {
      dom.window.close();
    }
  }
  async upload(
    project: string,
    doc: Y.Doc,
    input: {
      name: string;
      mimeType: string;
      base64: string;
      excalidraw?: string;
    },
  ) {
    const extensions: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/svg+xml': ['svg'],
      'application/pdf': ['pdf'],
    };
    const extension = path.extname(input.name).slice(1).toLowerCase();
    if (
      path.basename(input.name) !== input.name ||
      !extensions[input.mimeType]?.includes(extension)
    )
      throw new Error('UNSUPPORTED_GRAPHICS_FORMAT');
    if (
      input.base64.length > 22_369_624 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
    )
      throw new Error('INVALID_GRAPHICS_DATA');
    const bytes = Buffer.from(input.base64, 'base64');
    if (!bytes.length || bytes.length > 16 * 1024 * 1024)
      throw new Error('GRAPHICS_SIZE_LIMIT');
    validateGraphic(bytes, input.mimeType);
    if (input.excalidraw) {
      if (
        extension !== 'svg' ||
        JSON.parse(input.excalidraw).type !== 'excalidraw'
      )
        throw new Error('INVALID_EXCALIDRAW');
    }
    const id = `g${randomUUID()}`,
      folder = this.folder(project);
    await fs.ensureDir(folder);
    const staging = await fs.mkdtemp(path.join(folder, '.upload-'));
    const published: string[] = [];
    try {
      await fs.writeFile(path.join(staging, `${id}.${extension}`), bytes);
      if (extension === 'svg')
        await fs.writeFile(
          path.join(staging, `${id}.pdf`),
          await this.svgToPdf(bytes),
        );
      if (input.excalidraw)
        await fs.writeFile(
          path.join(staging, `${id}.excalidraw`),
          input.excalidraw,
        );
      await this.thumbnail(
        staging,
        `${id}.${extension === 'svg' ? 'pdf' : extension}`,
        id,
      );
      for (const filename of await fs.readdir(staging)) {
        const destination = path.join(folder, filename);
        await fs.move(path.join(staging, filename), destination);
        published.push(destination);
      }
      const graphic: Graphics = {
        id,
        name: input.excalidraw
          ? input.name.replace(/\.svg$/i, '.excalidraw')
          : input.name,
        border: false,
        width: 0.7,
        updatedAt: String(Date.now()),
      };
      putEntity(doc, 'graphics', graphic);
      return {
        graphic,
        html: `<img id="${id}" data-width="70" data-border="false">`,
      };
    } catch (error) {
      await Promise.all(published.map((file) => fs.remove(file)));
      throw error;
    } finally {
      await fs.remove(staging);
    }
  }
  async getGraphic(project: string, doc: Y.Doc, id: string, thumbnail = false) {
    this.safeId(id);
    const graphic = readExam(doc).graphics[id];
    if (!graphic) throw new Error('NOT_FOUND: graphic');
    const extension = thumbnail
      ? 'png'
      : path.extname(graphic.name).slice(1).toLowerCase();
    let filename = path.join(
      this.folder(project),
      thumbnail ? `${id}_thumb.png` : `${id}.${extension}`,
    );
    if (thumbnail) filename = resolveThumbnail(filename);
    // Legacy SVG uploads kept only the converted PDF. Return the actual format.
    const actual =
      !thumbnail && extension === 'svg' && !(await fs.pathExists(filename))
        ? path.join(this.folder(project), `${id}.pdf`)
        : filename;
    const mime: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      excalidraw: 'application/json',
    };
    return {
      graphic,
      mimeType:
        mime[path.extname(actual).slice(1)] || 'application/octet-stream',
      data: (await fs.readFile(actual)).toString('base64'),
    };
  }
  async deleteGraphic(project: string, doc: Y.Doc, id: string) {
    this.safeId(id);
    if (!doc.getMap('graphics').has(id)) throw new Error('NOT_FOUND: graphic');
    const used = referencesTo(readExam(doc), id);
    if (used.length || readExam(doc).source.includes(id))
      throw new Error(
        `ASSET_IN_USE: ${used.map((f) => f.entityId).join(', ')}`,
      );
    const folder = this.folder(project),
      staging = await fs.mkdtemp(path.join(folder, '.delete-'));
    const files = (await fs.readdir(folder)).filter(
      (name) =>
        name.startsWith(`${id}.`) ||
        name === `${id}_thumb.jpg` ||
        name === `${id}_thumb.png`,
    );
    try {
      for (const name of files)
        await fs.move(path.join(folder, name), path.join(staging, name));
      if (
        referencesTo(readExam(doc), id).length ||
        readExam(doc).source.includes(id)
      )
        throw new Error('ASSET_IN_USE');
      doc.getMap('graphics').delete(id);
    } catch (error) {
      for (const name of await fs.readdir(staging))
        await fs.move(path.join(staging, name), path.join(folder, name));
      throw error;
    } finally {
      await fs.remove(staging);
    }
    return {deleted: id};
  }
}
