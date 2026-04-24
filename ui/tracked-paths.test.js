import { describe, it, expect } from 'vitest';
import { TRACKED_FOLDERS, TRACKED_TAB_FILES } from './tracked-paths.js';

describe('tracked-paths config', () => {
  it('exposes the tracked tab file map', () => {
    expect(TRACKED_TAB_FILES).toEqual({
      instructions: 'instructions.txt',
      prompt: 'system-prompt.txt',
      description: 'description.txt',
      'first-response': 'intro.txt',
    });
  });

  it('exposes the tracked folder configuration', () => {
    expect(TRACKED_FOLDERS).toEqual([
      {
        path: 'context',
        extensions: ['.md', '.txt', '.pdf'],
      },
    ]);
  });
});
