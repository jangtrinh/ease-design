// Pure knowledge-chunking + corpus + scope helpers. No model, no DB.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { markdownFiles, chunkMarkdown, knowledgeItems, isLedgerId } from '../cli/src/knowledge.ts';
import { eventIdNumber, maxEventId, entityOf, type CorpusPayload } from '../cli/src/corpus.ts';
import { easeHome, namespacedId, cursorKey } from '../cli/src/scope.ts';

const tmpDirs: string[] = [];
function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('chunkMarkdown', () => {
  it('splits on "## " headings, keeping a preamble before the first heading as its own chunk', () => {
    const text = [
      'Preamble text',
      'More preamble',
      '',
      '## Section One',
      'Content one',
      '',
      '## Section Two',
      'Content two',
    ].join('\n');

    const chunks = chunkMarkdown(text);
    expect(chunks).toEqual([
      'Preamble text\nMore preamble',
      '## Section One\nContent one',
      '## Section Two\nContent two',
    ]);
  });

  it('when the document starts with a heading, there is no separate preamble chunk', () => {
    const text = ['## Only Section', 'body text'].join('\n');
    const chunks = chunkMarkdown(text);
    expect(chunks).toEqual(['## Only Section\nbody text']);
  });

  it('returns an empty array for empty input', () => {
    expect(chunkMarkdown('')).toEqual([]);
  });

  it('splits an oversized section by blank-line paragraphs', () => {
    // Three ~600-char paragraphs under one heading: total > MAX_CHARS(1200), so the
    // section is split by paragraph. para1+para2 alone would be 1200 (not > 1200,
    // stays together); para0+para1 is 1207 (> 1200, splits).
    const para1 = 'P1' + 'a'.repeat(598); // 600 chars
    const para2 = 'P2' + 'b'.repeat(598); // 600 chars
    const para3 = 'P3' + 'c'.repeat(598); // 600 chars
    const section = `## Big\n${para1}\n\n${para2}\n\n${para3}`;
    expect(section.length).toBeGreaterThan(1200);

    const chunks = chunkMarkdown(section);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain('## Big');
    expect(chunks[0]).toContain('P1');
    expect(chunks[0]).not.toContain('P2');
    expect(chunks[1]).toContain('P2');
    expect(chunks[1]).toContain('P3');
    expect(chunks[1]).not.toContain('## Big');
  });

  it('a section within MAX_CHARS is kept as a single chunk even with blank-line paragraphs', () => {
    const text = ['## Small', 'para one', '', 'para two'].join('\n');
    const chunks = chunkMarkdown(text);
    expect(chunks).toEqual(['## Small\npara one\n\npara two']);
  });
});

describe('markdownFiles', () => {
  it('recursively collects .md files in sorted order', () => {
    const root = tmpDir('recall-knowledge-test-');
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'z.md'), '# z');
    writeFileSync(join(root, 'a.md'), '# a');
    writeFileSync(join(root, 'not-markdown.txt'), 'nope');
    writeFileSync(join(root, 'sub', 'b.md'), '# b');

    const files = markdownFiles(root);
    const rels = files.map((f) => f.slice(root.length + 1));
    expect(rels).toEqual(['a.md', 'sub/b.md', 'z.md']);
  });

  it('returns an empty array for a nonexistent root', () => {
    expect(markdownFiles(join(tmpdir(), 'recall-does-not-exist-xyz'))).toEqual([]);
  });
});

describe('knowledgeItems', () => {
  it('turns markdown files into indexable items with stable ids and provenance-prefixed text', () => {
    const root = tmpDir('recall-knowledge-items-');
    writeFileSync(join(root, 'guide.md'), ['## First', 'hello world'].join('\n'));

    const items = knowledgeItems(root);
    expect(items.length).toBe(1);
    const it0 = items[0]!;
    expect(it0.id).toBe('k:guide.md#0');
    expect(it0.tier).toBe('semantic');
    expect(it0.source).toBe('knowledge');
    expect(it0.t).toBe('');
    expect(it0.entity).toBe('doc:guide.md');
    expect(it0.refs).toEqual([]);
    expect(it0.text).toBe('[guide.md] ## First\nhello world');
  });

  it('numbers multiple chunks from the same file sequentially', () => {
    const root = tmpDir('recall-knowledge-items-multi-');
    writeFileSync(join(root, 'doc.md'), ['Preamble', '', '## One', 'a', '', '## Two', 'b'].join('\n'));

    const items = knowledgeItems(root);
    expect(items.map((i) => i.id)).toEqual(['k:doc.md#0', 'k:doc.md#1', 'k:doc.md#2']);
    expect(items.every((i) => i.entity === 'doc:doc.md')).toBe(true);
  });

  it('namespaces ids per relative path across nested files', () => {
    const root = tmpDir('recall-knowledge-items-nested-');
    mkdirSync(join(root, 'nested'), { recursive: true });
    writeFileSync(join(root, 'nested', 'file.md'), 'just text');

    const items = knowledgeItems(root);
    expect(items[0]!.id).toBe('k:nested/file.md#0');
    expect(items[0]!.entity).toBe('doc:nested/file.md');
  });
});

describe('isLedgerId', () => {
  it('is true for a ledger event id', () => {
    expect(isLedgerId('e12')).toBe(true);
  });

  it('is false for a knowledge id', () => {
    expect(isLedgerId('k:a#0')).toBe(false);
  });

  it('is false for e-prefixed non-numeric ids', () => {
    expect(isLedgerId('exyz')).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(isLedgerId('')).toBe(false);
  });
});

describe('corpus: eventIdNumber', () => {
  it('parses a ledger id', () => {
    expect(eventIdNumber('e12')).toBe(12);
  });

  it('returns null for a non-matching id', () => {
    expect(eventIdNumber('k:a#0')).toBeNull();
  });

  it('returns null for e-prefixed non-numeric', () => {
    expect(eventIdNumber('eabc')).toBeNull();
  });
});

describe('corpus: maxEventId', () => {
  it('returns the highest event id in a batch', () => {
    const payloads: CorpusPayload[] = [
      { id: 'e1', tier: 'episodic', text: '', refs: [], t: '' },
      { id: 'e12', tier: 'episodic', text: '', refs: [], t: '' },
      { id: 'e3', tier: 'episodic', text: '', refs: [], t: '' },
    ];
    expect(maxEventId(payloads)).toBe('e12');
  });

  it('returns null for an empty batch', () => {
    expect(maxEventId([])).toBeNull();
  });

  it('ignores non-e<N> ids when computing the max', () => {
    const payloads: CorpusPayload[] = [
      { id: 'k:doc.md#0', tier: 'semantic', text: '', refs: [], t: '' },
      { id: 'e5', tier: 'episodic', text: '', refs: [], t: '' },
    ];
    expect(maxEventId(payloads)).toBe('e5');
  });

  it('returns null when no payload has a valid event id', () => {
    const payloads: CorpusPayload[] = [{ id: 'k:doc.md#0', tier: 'semantic', text: '', refs: [], t: '' }];
    expect(maxEventId(payloads)).toBeNull();
  });
});

describe('corpus: entityOf', () => {
  it('matches a token-rationale payload', () => {
    const p: CorpusPayload = {
      id: 'e1',
      tier: 'episodic',
      text: 'Token color.primary changed from #fff to #000',
      refs: [],
      t: '',
    };
    expect(entityOf(p)).toBe('token:color.primary');
  });

  it('returns undefined for a non-token payload', () => {
    const p: CorpusPayload = { id: 'e1', tier: 'episodic', text: 'Just a note about spacing', refs: [], t: '' };
    expect(entityOf(p)).toBeUndefined();
  });
});

describe('scope: namespacedId + cursorKey', () => {
  it('namespaces an id under a project', () => {
    expect(namespacedId('my-project', 'e12')).toBe('p:my-project:e12');
  });

  it('builds a per-project cursor key', () => {
    expect(cursorKey('my-project')).toBe('lastIndexedId:my-project');
  });
});

describe('scope: easeHome', () => {
  const ORIGINAL = process.env['EASE_DESIGN_HOME'];

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['EASE_DESIGN_HOME'];
    else process.env['EASE_DESIGN_HOME'] = ORIGINAL;
  });

  it('resolves EASE_DESIGN_HOME when set', () => {
    process.env['EASE_DESIGN_HOME'] = '/tmp/some-ease-home';
    expect(easeHome()).toBe(resolve('/tmp/some-ease-home'));
  });

  it('falls back to ~/.ease-design when unset', () => {
    delete process.env['EASE_DESIGN_HOME'];
    expect(easeHome()).toBe(join(homedir(), '.ease-design'));
  });

  it('falls back to ~/.ease-design when set to an empty string', () => {
    process.env['EASE_DESIGN_HOME'] = '';
    expect(easeHome()).toBe(join(homedir(), '.ease-design'));
  });
});
