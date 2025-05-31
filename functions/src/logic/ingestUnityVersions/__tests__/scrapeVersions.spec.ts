import { scrapeVersions } from '../scrapeVersions';
import { searchChangesets, SearchMode } from 'unity-changeset'; // Import for types if needed, and for jest.mock
import { EditorVersionInfo } from '../../../model/editorVersionInfo';

jest.mock('unity-changeset');

describe('scrapeVersions', () => {
  const mockSearchChangesets = searchChangesets as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should correctly parse and filter valid Unity versions', async () => {
    mockSearchChangesets.mockResolvedValue([
      { version: '2022.1.5f1', changeset: 'changeset1' },
      { version: '2017.4.40f1', changeset: 'changeset2' }, // LTS from 2017
      { version: '2016.4.0f1', changeset: 'changeset_old' }, // Too old
      { version: '2021.2.0p3', changeset: 'changeset_patch' }, // Not 'f' lifecycle
      { version: 'invalid', changeset: 'changeset_invalid' }, // Invalid format
      { version: '2023.1.0b12', changeset: 'changeset_beta' }, // Not 'f' lifecycle
    ]);

    const results = await scrapeVersions();

    expect(results).toEqual([
      { version: '2022.1.5f1', changeSet: 'changeset1', major: 2022, minor: 1, patch: '5' },
      { version: '2017.4.40f1', changeSet: 'changeset2', major: 2017, minor: 4, patch: '40' },
    ]);
    expect(mockSearchChangesets).toHaveBeenCalledWith(SearchMode.Default);
  });

  it('should return an empty array if all versions are filtered out', async () => {
    mockSearchChangesets.mockResolvedValue([
      { version: '2016.4.0f1', changeset: 'changeset_old' },
      { version: '2021.2.0p3', changeset: 'changeset_patch' },
    ]);
    const results = await scrapeVersions();
    expect(results).toEqual([]);
  });

  it('should throw error if searchChangesets returns empty array', async () => {
    mockSearchChangesets.mockResolvedValue([]);
    await expect(scrapeVersions()).rejects.toThrow('No Unity versions found!');
  });

  it('should throw error if searchChangesets returns null', async () => {
    mockSearchChangesets.mockResolvedValue(null);
    await expect(scrapeVersions()).rejects.toThrow('No Unity versions found!');
  });

  it('should throw error if searchChangesets returns undefined', async () => {
    mockSearchChangesets.mockResolvedValue(undefined);
    await expect(scrapeVersions()).rejects.toThrow('No Unity versions found!');
  });

  it('should propagate errors from searchChangesets', async () => {
    const originalError = new Error('Failed to fetch');
    mockSearchChangesets.mockRejectedValue(originalError);
    await expect(scrapeVersions()).rejects.toThrow(originalError);
  });
});
