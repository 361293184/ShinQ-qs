import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchWereadShelf, fetchWereadNotes } from './wereadApi';
import { buildWereadPerceptionContext } from './wereadPerception';
import type { WereadBook } from './types';

vi.mock('./wereadApi', () => ({
  fetchWereadShelf: vi.fn(),
  fetchWereadNotes: vi.fn(),
}));

const shelfBook: WereadBook = {
  bookId: 'b1',
  title: '窄门',
  author: '纪德',
  cover: 'https://weread.qq.com/web/bookCover/b1',
  readingStatus: 'reading',
  progress: 34,
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchWereadShelf).mockReset();
  vi.mocked(fetchWereadNotes).mockReset();
});

const enableReady = () => {
  localStorage.setItem('os_weread_profile', JSON.stringify({
    cookie: 'wr_vid=1; wr_skey=abcdefghijklmnop',
    roleAwareEnabled: true,
  }));
};

describe('buildWereadPerceptionContext', () => {
  it('returns empty when the toggle is off or cookie missing', async () => {
    expect(await buildWereadPerceptionContext()).toBe('');
    localStorage.setItem('os_weread_profile', JSON.stringify({ cookie: 'wr_vid=1; wr_skey=abcdefghijklmnop', roleAwareEnabled: false }));
    expect(await buildWereadPerceptionContext()).toBe('');
    expect(fetchWereadShelf).not.toHaveBeenCalled();
  });

  it('builds a readable block with reading status and capped highlights', async () => {
    enableReady();
    vi.mocked(fetchWereadShelf).mockResolvedValue([shelfBook]);
    vi.mocked(fetchWereadNotes).mockResolvedValue([
      { bookId: 'b1', noteType: 'highlight', markText: '人始终有选择的自由，这选择常常需要付出代价。', content: '' },
      { bookId: 'b1', noteType: 'thought', content: '这句很像你现在的处境。', markText: '' },
    ]);
    const out = await buildWereadPerceptionContext();
    expect(out).toContain('窄门');
    expect(out).toContain('读到 34%');
    expect(out).toContain('人始终有选择的自由');
    expect(out).toContain('想法：这句很像你现在的处境');
    expect(out).toContain('不要点破');
  });

  it('skips a book whose notes fail and still lists the book', async () => {
    enableReady();
    vi.mocked(fetchWereadShelf).mockResolvedValue([shelfBook]);
    vi.mocked(fetchWereadNotes).mockRejectedValue(new Error('notes down'));
    const out = await buildWereadPerceptionContext();
    expect(out).toContain('窄门');
    expect(out).not.toContain('· 划线');
  });

  it('returns empty when the shelf is empty or errors', async () => {
    enableReady();
    vi.mocked(fetchWereadShelf).mockResolvedValue([]);
    expect(await buildWereadPerceptionContext()).toBe('');
    vi.mocked(fetchWereadShelf).mockRejectedValue(new Error('shelf down'));
    expect(await buildWereadPerceptionContext()).toBe('');
  });
});
