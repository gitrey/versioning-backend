import { Scheduler } from '../scheduler'; // Adjust path as necessary
import { RepoVersionInfo } from '../../../model/repoVersionInfo'; // Adjust path as necessary

import { settings } from '../../../config/settings';
import { CiJobs } from '../../../model/ciJobs';
import { GitHub } from '../../../service/github';

// Mock settings, CiJobs, and GitHub
jest.mock('../../../config/settings', () => ({
  settings: {
    maxConcurrentJobs: 10 // Default mock value, can be overridden in tests
  }
}));

jest.mock('../../../service/github', () => ({
  GitHub: {
    init: jest.fn(),
  },
}));

jest.mock('../../../model/ciJobs', () => ({
  CiJobs: { // Mocking the class CiJobs
    getNumberOfScheduledJobs: jest.fn(),
    get: jest.fn(),
    markJobAsScheduled: jest.fn(),
    getFailingJobsQueue: jest.fn(),
    getPrioritisedQueue: jest.fn(),
    // Mock parseJobId as it's used by Scheduler and its absence could cause issues
    // during instantiation or other method calls even if not directly in determineOpenSpots.
    parseJobId: jest.fn((imageType, repoVersion, editorVersion) => {
      if (imageType !== 'editor' && editorVersion === undefined) { // Adjusted condition
        return `${imageType}-${repoVersion}`;
      }
      if (editorVersion) {
        return `${imageType}-${editorVersion}-${repoVersion}`;
      }
      // Fallback or throw error if arguments don't match expected patterns for mocked parseJobId
      return `mock-job-id-${imageType}-${repoVersion}-${editorVersion}`;
    }),
    // Add any other static methods from CiJobs that might be called
  }
}));


describe('Scheduler.parseRepoVersions', () => {
  it('should correctly parse valid repo version info', () => {
    const repoVersionInfo: RepoVersionInfo = {
      id: 1, // Added
      name: 'test-package', // Added
      description: 'Test package description', // Added
      author: 'Test Author', // Added
      url: 'http://example.com/repo', // Added
      commitIsh: 'main', // Added
      major: 2,
      minor: 1,
      patch: 3,
      version: '2.1.3',
    };

    const expected = {
      repoVersion: '2.1.3',
      repoVersionFull: '2.1.3',
      repoVersionMinor: '2.1',
      repoVersionMajor: '2',
    };

    const result = Scheduler.parseRepoVersions(repoVersionInfo);
    expect(result).toEqual(expected);
  });

  it('should throw an error if version string does not match components', () => {
    const repoVersionInfo: RepoVersionInfo = {
      id: 2, // Added
      name: 'test-package-mismatch', // Added
      description: 'Test package description mismatch', // Added
      author: 'Test Author Mismatch', // Added
      url: 'http://example.com/repo/mismatch', // Added
      commitIsh: 'develop', // Added
      major: 2,
      minor: 1,
      patch: 3,
      version: '2.1.4', // Mismatch
    };

    expect(() => Scheduler.parseRepoVersions(repoVersionInfo)).toThrowError(
      /Expected version information to be reliable/
    );
  });
});

describe('Scheduler instance methods', () => {
  let scheduler: Scheduler;
  let mockRepoVersionInfo: RepoVersionInfo; // Use a more complete version for instance tests

  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    // This is a more complete RepoVersionInfo mock, adjust as needed
    // based on what the Scheduler constructor actually uses.
    // The existing parseRepoVersions tests use a minimal version.
    mockRepoVersionInfo = {
      id: 123, // Changed to number to match interface
      name: 'Test Version Package',
      description: 'A version for testing instance methods',
      author: 'Test Instance Author',
      url: 'http://example.com/test-instance-version',
      major: 1,
      minor: 0,
      patch: 0,
      version: '1.0.0', // Must match major.minor.patch
      commitIsh: 'abcdef1234567890',
      // Fields below were in the example, but not in the interface from previous subtask.
      // Let's assume they are not strictly needed by constructor or determineOpenSpots for now.
      // If errors occur, we might need to re-evaluate RepoVersionInfo structure or constructor needs.
      // specificVersion: '1.0.0',
      // lts: false,
      // branch: 'main',
      // compatibleBranches: ['main'],
      // lastPublishedAt: new Date().toISOString(),
    };
    // Default mock for getNumberOfScheduledJobs
    (CiJobs.getNumberOfScheduledJobs as jest.Mock).mockResolvedValue(0);
  });

  describe('determineOpenSpots', () => {
    it('should return positive open spots when jobs are running below capacity', async () => {
      settings.maxConcurrentJobs = 10;
      (CiJobs.getNumberOfScheduledJobs as jest.Mock).mockResolvedValue(5);
      // Assuming Scheduler constructor only needs a basic RepoVersionInfo object
      // and doesn't call its methods or complex static methods of other classes not yet mocked.
      scheduler = new Scheduler(mockRepoVersionInfo);
      const openSpots = await scheduler['determineOpenSpots']();
      expect(openSpots).toBe(5);
    });

    it('should return 0 open spots when jobs are running at capacity', async () => {
      settings.maxConcurrentJobs = 10;
      (CiJobs.getNumberOfScheduledJobs as jest.Mock).mockResolvedValue(10);
      scheduler = new Scheduler(mockRepoVersionInfo);
      const openSpots = await scheduler['determineOpenSpots']();
      expect(openSpots).toBe(0);
    });

    it('should return 0 open spots when jobs are running over capacity', async () => {
      settings.maxConcurrentJobs = 10;
      (CiJobs.getNumberOfScheduledJobs as jest.Mock).mockResolvedValue(12);
      scheduler = new Scheduler(mockRepoVersionInfo);
      const openSpots = await scheduler['determineOpenSpots']();
      expect(openSpots).toBe(0);
    });
  });

  // Potentially other describe blocks for other instance methods like init, ensureThatBaseImageHasBeenBuilt etc.

  describe('init', () => {
    it('should initialize GitHub client and return the scheduler instance', async () => {
      const mockOctokitInstance = { repos: {} }; // A simplified mock Octokit
      (GitHub.init as jest.Mock).mockResolvedValue(mockOctokitInstance);

      scheduler = new Scheduler(mockRepoVersionInfo); // mockRepoVersionInfo from parent describe

      const result = await scheduler.init('testPrivateKey', 'testClientSecret');

      expect(GitHub.init).toHaveBeenCalledWith('testPrivateKey', 'testClientSecret');
      expect(scheduler['_gitHub']).toBe(mockOctokitInstance);
      expect(result).toBe(scheduler); // Check if it returns 'this'
    });

    it('should throw if GitHub.init fails', async () => {
      const initError = new Error('GitHub init failed');
      (GitHub.init as jest.Mock).mockRejectedValue(initError);

      scheduler = new Scheduler(mockRepoVersionInfo);

      await expect(scheduler.init('testPrivateKey', 'testClientSecret'))
        .rejects.toThrow(initError);
      expect(scheduler['_gitHub']).toBeUndefined();
    });
  });
});
