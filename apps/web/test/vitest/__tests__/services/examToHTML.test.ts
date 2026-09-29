import { afterEach, expect, it, vi } from 'vitest';
import examToHTML from '../../../../src/services/examToHTML';

vi.mock('@/stores/exam', () => ({
  useExamStore: () => ({
    exam: {
      sections: [{ title: 'Images', level: 1, content: '<img id="graphic">', questions: [] }]
    },
    graphicsPreviewURL: () => '/graphic_thumb.png'
  })
}));
vi.mock('@/stores/api', () => ({ useApiStore: () => ({ project: 'test' }) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['image/png', 'image/jpeg'])('exports the actual thumbnail MIME type: %s', async (mime) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: async () => new Blob(['image'], { type: mime }) })
  );
  const createObjectURL = vi.fn().mockReturnValue('blob:export');
  vi.stubGlobal('URL', { createObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await examToHTML();
  const html = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(createObjectURL.mock.calls[0][0]);
  });
  expect(html).toContain(`src="data:${mime};base64,aW1hZ2U="`);
});
