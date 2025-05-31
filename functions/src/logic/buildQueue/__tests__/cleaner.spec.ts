import { Cleaner } from '../cleaner';
// Removed duplicate imports with incorrect paths:
// import { CiBuilds } from '../../model/ciBuilds';
// import { Discord } from '../../service/discord';
// import { Dockerhub } from '../../service/dockerhub';
import { Timestamp } from 'firebase-admin/firestore'; // For meta.lastBuildStart

// Explicitly mock the classes and their static methods
jest.mock('../../../model/ciBuilds', () => ({ // Corrected path
  CiBuilds: {
    getStartedBuilds: jest.fn(),
    markBuildAsFailed: jest.fn(),
    markBuildAsPublished: jest.fn(),
  }
}));
jest.mock('../../../service/discord', () => ({ // Corrected path
  Discord: {
    sendDebug: jest.fn(),
    sendAlert: jest.fn(),
  }
}));
jest.mock('../../../service/dockerhub', () => ({ // Corrected path
  Dockerhub: {
    fetchImageData: jest.fn(),
    getImageName: jest.fn(),
    getRepositoryBaseName: jest.fn(),
  }
}));

// Re-import after mocks with corrected paths
import { CiBuilds } from '../../../model/ciBuilds';
import { Discord } from '../../../service/discord';
import { Dockerhub } from '../../../service/dockerhub';

describe('Cleaner.cleanUp', () => {
  // The mockCiBuilds, mockDiscord, mockDockerhub will now correctly reference the mocked versions
  // due to Jest's hoisting of jest.mock. No need to cast from imported versions.
  // However, to use the mock functions defined in the factory, we access them via the original imports.
  const mockCiBuildsGetStartedBuilds = CiBuilds.getStartedBuilds as jest.Mock;
  const mockCiBuildsMarkBuildAsFailed = CiBuilds.markBuildAsFailed as jest.Mock;
  const mockCiBuildsMarkBuildAsPublished = CiBuilds.markBuildAsPublished as jest.Mock;
  const mockDiscordSendDebug = Discord.sendDebug as jest.Mock;
  const mockDiscordSendAlert = Discord.sendAlert as jest.Mock;
  const mockDockerhubFetchImageData = Dockerhub.fetchImageData as jest.Mock;
  const mockDockerhubGetImageName = Dockerhub.getImageName as jest.Mock;
  const mockDockerhubGetRepositoryBaseName = Dockerhub.getRepositoryBaseName as jest.Mock;


  const sixHoursInMs = 6 * 60 * 60 * 1000;
  const now = new Date('2024-01-01T12:00:00.000Z');
  const sevenHoursAgoTimestamp = Timestamp.fromMillis(now.getTime() - (sixHoursInMs + 1000 * 60 * 60)); // 7 hours ago
  const threeHoursAgoTimestamp = Timestamp.fromMillis(now.getTime() - (3 * 60 * 60 * 1000)); // 3 hours ago

  beforeEach(() => {
    // jest.resetAllMocks() would reset the implementations too.
    // We want to clear call counts but keep the mock structure.
    mockCiBuildsGetStartedBuilds.mockClear();
    mockCiBuildsMarkBuildAsFailed.mockClear();
    mockCiBuildsMarkBuildAsPublished.mockClear();
    mockDiscordSendDebug.mockClear();
    mockDiscordSendAlert.mockClear();
    mockDockerhubFetchImageData.mockClear();
    mockDockerhubGetImageName.mockClear();
    mockDockerhubGetRepositoryBaseName.mockClear();

    jest.useFakeTimers();
    jest.setSystemTime(now);
    // Cleaner.buildsProcessed is reset by cleanUp itself.
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createMockBuild = (overrides: any = {}) => ({
    buildId: 'test-build-id',
    imageType: 'editor',
    relatedJobId: 'test-job-id',
    meta: {
      publishedDate: null,
      lastBuildStart: sevenHoursAgoTimestamp, // Default to timed out
      ...overrides.meta,
    },
    buildInfo: {
      baseOs: 'ubuntu',
      repoVersion: '2022.1.1f1',
      targetPlatform: 'StandaloneLinux64', // Added default, may be needed by getImageName
      ...overrides.buildInfo,
    },
    ...overrides,
  });

  it('should send debug and skip if build has publishedDate', async () => {
    const mockBuild = createMockBuild({ meta: { publishedDate: new Date().toISOString() } });
    mockCiBuildsGetStartedBuilds.mockResolvedValue([mockBuild]);

    await Cleaner.cleanUp();

    expect(mockDiscordSendDebug).toHaveBeenCalledWith(expect.stringContaining('has a publication date'));
    expect(mockCiBuildsMarkBuildAsFailed).not.toHaveBeenCalled();
    expect(mockCiBuildsMarkBuildAsPublished).not.toHaveBeenCalled();
  });

  it('should send alert and skip if build has no lastBuildStart', async () => {
    const mockBuild = createMockBuild({ meta: { lastBuildStart: null } });
    mockCiBuildsGetStartedBuilds.mockResolvedValue([mockBuild]);

    await Cleaner.cleanUp();

    expect(mockDiscordSendAlert).toHaveBeenCalledWith(expect.stringContaining('does not have a "lastBuildStart" date'));
    expect(mockCiBuildsMarkBuildAsFailed).not.toHaveBeenCalled();
  });

  it('should skip if build started less than 6 hours ago', async () => {
    const mockBuild = createMockBuild({ meta: { lastBuildStart: threeHoursAgoTimestamp } });
    mockCiBuildsGetStartedBuilds.mockResolvedValue([mockBuild]);

    await Cleaner.cleanUp();

    expect(mockDockerhubFetchImageData).not.toHaveBeenCalled();
    expect(mockCiBuildsMarkBuildAsFailed).not.toHaveBeenCalled();
    expect(mockCiBuildsMarkBuildAsPublished).not.toHaveBeenCalled();
  });

  it('should mark as failed if timed out and image does not exist', async () => {
    const mockBuild = createMockBuild(); // Default: timed out
    mockCiBuildsGetStartedBuilds.mockResolvedValue([mockBuild]);
    mockDockerhubFetchImageData.mockResolvedValue(null);
    // Mock getImageName as it's called before fetchImageData in the code
    mockDockerhubGetImageName.mockReturnValue('mockorg/mockimage');


    await Cleaner.cleanUp();

    // Expect getImageName to be called with buildId (which includes imageType prefix)
    // and buildInfo (which contains targetPlatform)
    // Note: In cleaner.ts, getImageName is called with imageType only for the published case.
    // For fetchImageData, it seems to construct the tag differently.
    // The original test had: expect(mockDockerhub.getImageName).toHaveBeenCalledWith(mockBuild.imageType, mockBuild.buildInfo);
    // But cleaner.ts calls: Dockerhub.fetchImageData(imageType, tag) where tag is derived from buildId.
    // So, getImageName isn't directly used to form the tag for fetchImageData.
    // It IS used if the image IS found, to construct part of the publication data.

    // Let's verify fetchImageData was called with the correct derived tag.
    // The tag is derived as: buildId.replace(new RegExp(`^${imageType}-`), '')
    const expectedTag = mockBuild.buildId.replace(new RegExp(`^${mockBuild.imageType}-`), '');
    expect(mockDockerhubFetchImageData).toHaveBeenCalledWith(mockBuild.imageType, expectedTag);
    expect(mockDiscordSendAlert).toHaveBeenCalledWith(expect.stringContaining('never reported back'));
    expect(mockCiBuildsMarkBuildAsFailed).toHaveBeenCalledWith(mockBuild.buildId, {
      reason: expect.stringContaining('never reported back'),
    });
  });

  it('should mark as published if timed out and image exists', async () => {
    const mockBuild = createMockBuild(); // Default: timed out
    mockCiBuildsGetStartedBuilds.mockResolvedValue([mockBuild]);
    mockDockerhubFetchImageData.mockResolvedValue({ last_updated: new Date().toISOString() }); // Image exists
    mockDockerhubGetImageName.mockReturnValue('mockorg/editor-test-build-id');
    mockDockerhubGetRepositoryBaseName.mockReturnValue('mockorg/editor');


    await Cleaner.cleanUp();

    const expectedTag = mockBuild.buildId.replace(new RegExp(`^${mockBuild.imageType}-`), '');
    expect(mockDockerhubFetchImageData).toHaveBeenCalledWith(mockBuild.imageType, expectedTag);
    expect(mockDiscordSendDebug).toHaveBeenCalledWith(expect.stringContaining('got stuck'));
    expect(mockCiBuildsMarkBuildAsPublished).toHaveBeenCalledWith(
      mockBuild.buildId,
      mockBuild.relatedJobId,
      expect.objectContaining({
        // digest: '', // Digest is not part of the mock image data, so it will be empty
        specificTag: `${mockBuild.buildInfo.baseOs}-${mockBuild.buildInfo.repoVersion}`,
        friendlyTag: mockBuild.buildInfo.repoVersion.replace(/\.\d+$/, ''), // Corrected expectation
        imageName: 'mockorg/editor-test-build-id', // This comes from Dockerhub.getImageName(imageType)
        imageRepo: 'mockorg/editor', // This comes from Dockerhub.getRepositoryBaseName()
      }),
    );
    // Verify that Dockerhub.getImageName was called correctly for the publication data
    expect(mockDockerhubGetImageName).toHaveBeenCalledWith(mockBuild.imageType);
    expect(mockDockerhubGetRepositoryBaseName).toHaveBeenCalled();
  });

  it('should respect maxBuildsProcessedPerRun', async () => {
    const builds = Array(Cleaner.maxBuildsProcessedPerRun + 2)
      .fill(null)
      .map((_, i) => createMockBuild({ buildId: `test-build-${i}` })); // All timed out
    mockCiBuildsGetStartedBuilds.mockResolvedValue(builds);
    // mockDockerhubGetImageName.mockImplementation((buildId: string) => `mockorg/editor-${buildId}`); // Not strictly needed if all fail before publication part
    mockDockerhubFetchImageData.mockResolvedValue(null); // All images don't exist

    await Cleaner.cleanUp();

    expect(mockCiBuildsMarkBuildAsFailed).toHaveBeenCalledTimes(Cleaner.maxBuildsProcessedPerRun);
  });
});
