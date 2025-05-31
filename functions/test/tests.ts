import { CiJobs, CiJob, JobStatus, CiJobQueueItem } from '../ciJobs';
import { db, admin } from '../../service/firebase';
import { logger } from 'firebase-functions/v2';
import { settings } from '../../config/settings';
import { EditorVersionInfo } from '../editorVersionInfo';
import { RepoVersionInfo } from '../repoVersionInfo';
import { ImageType } from '../image';

// Mock Firebase services
jest.mock('../../service/firebase', () => {
  const originalAdmin = jest.requireActual('firebase-admin');
  return {
    db: {
      collection: jest.fn(),
      batch: jest.fn(() => ({
        create: jest.fn(),
        set: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      })),
    },
    admin: {
      firestore: {
        Timestamp: {
          now: jest.fn(() => ({
            toDate: () => new Date(),
            toMillis: () => Date.now(),
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0,
          })),
        },
        FieldValue: {
          increment: jest.fn((val: number) => `INCREMENT_${val}`), // Sentinel for increment
        },
      },
    },
  };
});

// Mock logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock settings
jest.mock('../../config/settings', () => ({
  settings: {
    maxConcurrentJobs: 5,
    // Add other settings if they are used directly and influence logic
  },
}));

const mockRepoVersionInfo: RepoVersionInfo = {
  id: 1,
  version: '1.0.0',
  major: 1,
  minor: 0,
  patch: 0,
  name: 'Test Repo Version',
  description: 'Test Description',
  author: 'Test Author',
  url: 'http://example.com/repo',
  commitIsh: 'main',
};

const mockEditorVersionInfo: EditorVersionInfo = {
  version: '2022.1.0f1',
  changeSet: 'abcdef123456',
  major: 2022,
  minor: 1,
  patch: '0f1',
};

const mockEditorVersionInfoLegacy: EditorVersionInfo = {
  version: '2017.4.0f1',
  changeSet: 'legacycset',
  major: 2017,
  minor: 4,
  patch: '0f1',
};


describe('CiJobs', () => {
  let mockCollectionRef: any;
  let mockDocRef: any;
  let mockQueryRef: any;
  let mockBatch: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDocRef = {
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      set: jest.fn(),
    };

    mockQueryRef = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    mockCollectionRef = {
      doc: jest.fn(() => mockDocRef),
      get: jest.fn().mockResolvedValue({ docs: [] }),
      ...mockQueryRef, // Spread query methods for direct use on collection
    };
    
    mockBatch = {
      create: jest.fn(),
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    (db.collection as jest.Mock).mockReturnValue(mockCollectionRef);
    (db.batch as jest.Mock).mockReturnValue(mockBatch);
    (admin.firestore.Timestamp.now as jest.Mock).mockReturnValue({
      seconds: 1600000000,
      nanoseconds: 0,
      toDate: () => new Date(1600000000000),
      toMillis: () => 1600000000000,
    });
  });

  describe('collection', () => {
    it('should return the correct collection name', () => {
      expect(CiJobs.collection).toBe('ciJobs');
    });
  });

  describe('get', () => {
    it('should return job data if job exists', async () => {
      const mockJobData = { id: 'test-job', status: 'created' } as CiJob;
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => mockJobData });
      const job = await CiJobs.get('test-job');
      expect(job).toEqual(mockJobData);
      expect(db.collection).toHaveBeenCalledWith('ciJobs');
      expect(mockCollectionRef.doc).toHaveBeenCalledWith('test-job');
    });

    it('should return null if job does not exist', async () => {
      mockDocRef.get.mockResolvedValue({ exists: false });
      const job = await CiJobs.get('non-existent-job');
      expect(job).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true if job exists', async () => {
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}) });
      const exists = await CiJobs.exists('test-job');
      expect(exists).toBe(true);
    });

    it('should return false if job does not exist', async () => {
      mockDocRef.get.mockResolvedValue({ exists: false });
      const exists = await CiJobs.exists('non-existent-job');
      expect(exists).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all jobs', async () => {
      const mockJobs = [{ id: 'job1' }, { id: 'job2' }] as CiJob[];
      mockCollectionRef.get.mockResolvedValue({ docs: mockJobs.map(j => ({ data: () => j })) });
      const jobs = await CiJobs.getAll();
      expect(jobs).toEqual(mockJobs);
      expect(db.collection).toHaveBeenCalledWith('ciJobs');
    });
  });

  describe('getAllIds', () => {
    it('should return all job IDs', async () => {
      const mockDocs = [{ id: 'job1' }, { id: 'job2' }];
      mockCollectionRef.get.mockResolvedValue({ docs: mockDocs });
      const ids = await CiJobs.getAllIds();
      expect(ids).toEqual(['job1', 'job2']);
    });
  });

  describe('getPrioritisedQueue', () => {
    it('should return a prioritised queue of created jobs', async () => {
      const jobData1: CiJob = { status: 'created', imageType: 'editor', repoVersionInfo: mockRepoVersionInfo, editorVersionInfo: mockEditorVersionInfo } as CiJob;
      const jobData2: CiJob = { status: 'created', imageType: 'editor', repoVersionInfo: mockRepoVersionInfo, editorVersionInfo: { ...mockEditorVersionInfo, version: '2021.1.0f1' } } as CiJob;
      const mockDocs = [
        { id: 'job1', data: () => jobData1 },
        { id: 'job2', data: () => jobData2 },
      ];
      mockQueryRef.get.mockResolvedValue({ docs: mockDocs });

      const queue = await CiJobs.getPrioritisedQueue();

      expect(queue).toEqual([
        { id: 'job1', data: jobData1 },
        { id: 'job2', data: jobData2 },
      ]);
      expect(mockCollectionRef.orderBy).toHaveBeenCalledWith('editorVersionInfo.major', 'desc');
      expect(mockCollectionRef.orderBy).toHaveBeenCalledWith('editorVersionInfo.minor', 'desc');
      expect(mockCollectionRef.orderBy).toHaveBeenCalledWith('editorVersionInfo.patch', 'desc');
      expect(mockCollectionRef.where).toHaveBeenCalledWith('status', '==', 'created');
      expect(mockCollectionRef.limit).toHaveBeenCalledWith(settings.maxConcurrentJobs);
      expect(logger.debug).toHaveBeenCalledWith(`BuildQueue size: ${mockDocs.length}`);
    });
  });

  describe('getFailingJobsQueue', () => {
    it('should return a queue of failed jobs', async () => {
      const jobData: CiJob = { status: 'failed', imageType: 'editor', repoVersionInfo: mockRepoVersionInfo, editorVersionInfo: mockEditorVersionInfo } as CiJob;
      const mockDocs = [{ id: 'job-fail', data: () => jobData }];
      mockQueryRef.get.mockResolvedValue({ docs: mockDocs });

      const queue = await CiJobs.getFailingJobsQueue();
      expect(queue).toEqual([{ id: 'job-fail', data: jobData }]);
      expect(mockCollectionRef.where).toHaveBeenCalledWith('status', '==', 'failed');
    });
  });

  describe('getNumberOfScheduledJobs', () => {
    it('should return the count of scheduled or inProgress jobs', async () => {
      mockQueryRef.get.mockResolvedValue({ docs: [{}, {}] }); // Two jobs
      const count = await CiJobs.getNumberOfScheduledJobs();
      expect(count).toBe(2);
      expect(mockCollectionRef.where).toHaveBeenCalledWith('status', 'in', ['scheduled', 'inProgress']);
    });
  });

  describe('construct', () => {
    it('should construct a job with status "created" for recent Unity versions', () => {
      const job = CiJobs.construct('editor', mockRepoVersionInfo, mockEditorVersionInfo);
      expect(job.status).toBe('created');
      expect(job.imageType).toBe('editor');
      expect(job.repoVersionInfo).toBe(mockRepoVersionInfo);
      expect(job.editorVersionInfo).toBe(mockEditorVersionInfo);
      expect(job.meta.failureCount).toBe(0);
    });

    it('should construct a job with status "deprecated" for legacy Unity versions (before 2018.2)', () => {
      const job = CiJobs.construct('editor', mockRepoVersionInfo, mockEditorVersionInfoLegacy);
      expect(job.status).toBe('deprecated');
    });
    
    it('should construct a job with status "created" for Unity 2018.2 and later', () => {
      const editorV2018_2: EditorVersionInfo = { ...mockEditorVersionInfo, major: 2018, minor: 2, version: '2018.2.0f1' };
      const job = CiJobs.construct('editor', mockRepoVersionInfo, editorV2018_2);
      expect(job.status).toBe('created');
    });

    it('should construct a job with status "created" for non-editor types', () => {
      const job = CiJobs.construct('base', mockRepoVersionInfo, null);
      expect(job.status).toBe('created');
      expect(job.editorVersionInfo).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a job document', async () => {
      const jobId = 'editor-2022.1.0f1-1.0.0';
      // Spy on construct to ensure it's called and to control its output for this test
      const constructSpy = jest.spyOn(CiJobs, 'construct');
      const constructedJob = { status: 'created', imageType: 'editor' } as CiJob;
      constructSpy.mockReturnValue(constructedJob);

      await CiJobs.create(jobId, 'editor', mockRepoVersionInfo, mockEditorVersionInfo);

      expect(constructSpy).toHaveBeenCalledWith('editor', mockRepoVersionInfo, mockEditorVersionInfo);
      expect(mockCollectionRef.doc).toHaveBeenCalledWith(jobId);
      expect(mockDocRef.create).toHaveBeenCalledWith(constructedJob);
      expect(logger.debug).toHaveBeenCalledWith('Job created', undefined); // Assuming create returns undefined on success
      constructSpy.mockRestore();
    });
  });

  describe('markJobAsScheduled', () => {
    it('should update status to "scheduled" if current status is "created"', async () => {
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({ status: 'created' }) });
      await CiJobs.markJobAsScheduled('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'scheduled',
        modifiedDate: expect.any(Object),
      });
    });

    it('should not change status if current status is "failed"', async () => {
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({ status: 'failed' }) });
      await CiJobs.markJobAsScheduled('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'failed', // Stays failed
        modifiedDate: expect.any(Object),
      });
    });

    it('should throw if job does not exist', async () => {
      mockDocRef.get.mockResolvedValue({ exists: false });
      await expect(CiJobs.markJobAsScheduled('job1')).rejects.toThrow(
        "Trying to mark job 'job1' as scheduled. But it does not exist."
      );
    });
  });

  describe('markJobAsInProgress', () => {
    it('should update status to "inProgress" if current status is "scheduled"', async () => {
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({ status: 'scheduled' }) });
      await CiJobs.markJobAsInProgress('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'inProgress',
        'meta.lastBuildStart': expect.any(Object),
      }));
    });
    
    it('should not change status if current status is "failed"', async () => {
      mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({ status: 'failed' }) });
      await CiJobs.markJobAsInProgress('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'failed',
      }));
    });

    it('should throw if job does not exist', async () => {
      mockDocRef.get.mockResolvedValue({ exists: false });
      await expect(CiJobs.markJobAsInProgress('job1')).rejects.toThrow(
        "Trying to mark job 'job1' as in progress. But it does not exist."
      );
    });
  });

  describe('markFailureForJob', () => {
    it('should update status to "failed" and increment failure count', async () => {
      await CiJobs.markFailureForJob('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'failed',
        'meta.failureCount': 'INCREMENT_1',
        'meta.lastBuildFailure': expect.any(Object),
        modifiedDate: expect.any(Object),
      });
    });
  });

  describe('markJobAsCompleted', () => {
    it('should update status to "completed"', async () => {
      await CiJobs.markJobAsCompleted('job1');
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'completed',
        modifiedDate: expect.any(Object),
      });
    });
  });

  describe('removeDryRunJob', () => {
    it('should delete a dryRun job', async () => {
      await CiJobs.removeDryRunJob('dryRun-job1');
      expect(mockCollectionRef.doc).toHaveBeenCalledWith('dryRun-job1');
      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it('should throw if job ID does not start with "dryRun"', async () => {
      await expect(CiJobs.removeDryRunJob('job1')).rejects.toThrow(
        'Expect only dryRun jobs to be deleted.'
      );
    });
  });

  describe('markJobsBeforeRepoVersionAsSuperseded', () => {
    it('should mark jobs as superseded in batches', async () => {
      const mockDocsCreated = [
        { id: 'job-old-created1', ref: { path: 'ciJobs/job-old-created1' } },
        { id: 'job-old-created2', ref: { path: 'ciJobs/job-old-created2' } },
      ];
      const mockDocsFailed = [
        { id: 'job-old-failed1', ref: { path: 'ciJobs/job-old-failed1' } },
      ];

      // First call for 'created' status
      mockQueryRef.get
        .mockResolvedValueOnce({ docs: mockDocsCreated.map(doc => ({ ...doc, data: () => ({ status: 'created' }) })) });
      // Second call for 'failed' status
      mockQueryRef.get
        .mockResolvedValueOnce({ docs: mockDocsFailed.map(doc => ({ ...doc, data: () => ({ status: 'failed' }) })) });
      
      const newRepoVersion = '2.0.0';
      const numSuperseded = await CiJobs.markJobsBeforeRepoVersionAsSuperseded(newRepoVersion);

      expect(numSuperseded).toBe(3);
      expect(mockCollectionRef.where).toHaveBeenCalledWith('repoVersionInfo.version', '<', newRepoVersion);
      expect(mockCollectionRef.where).toHaveBeenCalledWith('status', '==', 'created');
      expect(mockCollectionRef.where).toHaveBeenCalledWith('status', '==', 'failed');
      
      expect(db.batch).toHaveBeenCalledTimes(2); // Once for 'created', once for 'failed'
      expect(mockBatch.set).toHaveBeenCalledTimes(3);
      expect(mockBatch.set).toHaveBeenCalledWith(mockDocsCreated[0].ref, { status: 'superseded' }, { merge: true });
      expect(mockBatch.set).toHaveBeenCalledWith(mockDocsCreated[1].ref, { status: 'superseded' }, { merge: true });
      expect(mockBatch.set).toHaveBeenCalledWith(mockDocsFailed[0].ref, { status: 'superseded' }, { merge: true });
      expect(mockBatch.commit).toHaveBeenCalledTimes(2);
    });

     it('should handle empty query results gracefully', async () => {
      mockQueryRef.get.mockResolvedValue({ docs: [] }); // For both 'created' and 'failed'
      const numSuperseded = await CiJobs.markJobsBeforeRepoVersionAsSuperseded('2.0.0');
      expect(numSuperseded).toBe(0);
      expect(db.batch).not.toHaveBeenCalled();
    });
  });

  describe('generateJobId', () => {
    it('should generate correct ID for base image type', () => {
      expect(CiJobs.generateJobId('base', mockRepoVersionInfo)).toBe('base-1.0.0');
    });

    it('should generate correct ID for hub image type', () => {
      expect(CiJobs.generateJobId('hub', mockRepoVersionInfo)).toBe('hub-1.0.0');
    });

    it('should generate correct ID for editor image type', () => {
      expect(CiJobs.generateJobId('editor', mockRepoVersionInfo, mockEditorVersionInfo)).toBe(
        'editor-2022.1.0f1-1.0.0'
      );
    });

    it('should throw if editorVersionInfo is null for editor image type', () => {
      expect(() => CiJobs.generateJobId('editor', mockRepoVersionInfo, null)).toThrow(
        'editorVersionInfo must be provided for editor build jobs.'
      );
    });
  });

  describe('parseJobId', () => {
    it('should parse job ID for base image type', () => {
      expect(CiJobs.parseJobId('base', '1.0.0')).toBe('base-1.0.0');
    });

    it('should parse job ID for editor image type', () => {
      expect(CiJobs.parseJobId('editor', '1.0.0', '2022.1.0f1')).toBe(
        'editor-2022.1.0f1-1.0.0'
      );
    });

    it('should throw if editorVersion is null for editor image type', () => {
      expect(() => CiJobs.parseJobId('editor', '1.0.0', null)).toThrow(
        'editorVersion must be provided for editor build jobs.'
      );
    });
  });

  describe('pluralise', () => {
    it('should return singular form for 1 job', () => {
      expect(CiJobs.pluralise(1)).toBe('1 CI Job');
    });

    it('should return plural form for 0 jobs', () => {
      expect(CiJobs.pluralise(0)).toBe('0 CI Jobs');
    });

    it('should return plural form for multiple jobs', () => {
      expect(CiJobs.pluralise(5)).toBe('5 CI Jobs');
    });
  });
});
