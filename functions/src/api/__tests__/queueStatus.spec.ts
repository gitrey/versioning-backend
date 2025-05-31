import { queueStatus } from '../queueStatus'; // Adjust if necessary
import { CiJobs } from '../../model/ciJobs';
import { CiBuilds } from '../../model/ciBuilds';
import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';

// Mock the models
jest.mock('../../model/ciJobs');
jest.mock('../../model/ciBuilds');

describe('queueStatus API', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusSpy: jest.SpyInstance;
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks for each test
    jest.clearAllMocks();

    mockRequest = {};

    // Spies that will be assigned to mockResponse properties
    const actualSendSpy = jest.fn();
    const actualStatusSpy = jest.fn();

    mockResponse = {
      status: jest.fn((code: number) => { // Explicitly define the function signature
        actualStatusSpy(code); // Call the underlying spy to track calls
        return mockResponse as Response; // Return 'this' (the mockResponse)
      }),
      send: jest.fn((body?: any) => { // Explicitly define the function signature
        actualSendSpy(body); // Call the underlying spy to track calls
        return mockResponse as Response; // Return 'this' (the mockResponse)
      }),
    } as Partial<Response>;

    // Use these for expect assertions
    sendSpy = actualSendSpy;
    statusSpy = actualStatusSpy;
  });

  it('should fetch all jobs and builds and return them with a 200 status', async () => {
    const mockJobs = [{ id: 'job1', status: 'queued' }] as any; // Using 'as any' for simplicity in test data
    const mockBuilds = [{ id: 'build1', status: 'running' }] as any; // Using 'as any' for simplicity

    (CiJobs.getAll as jest.Mock).mockResolvedValue(mockJobs);
    (CiBuilds.getAll as jest.Mock).mockResolvedValue(mockBuilds);

    // It's an onRequest handler, so we need to get the actual function
    // The way it's exported, queueStatus IS the function.
    // If it were wrapped, e.g. functions.https.onRequest(...), we'd need to extract it.

    await queueStatus(mockRequest as Request, mockResponse as Response);

    expect(CiJobs.getAll).toHaveBeenCalledTimes(1);
    expect(CiBuilds.getAll).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith(200);
    expect(sendSpy).toHaveBeenCalledWith({ jobs: mockJobs, builds: mockBuilds });
  });

  it('should handle errors gracefully if CiJobs.getAll fails', async () => {
    const error = new Error('Failed to get jobs');
    (CiJobs.getAll as jest.Mock).mockRejectedValue(error);
    (CiBuilds.getAll as jest.Mock).mockResolvedValue([] as any); // Builds succeed for this test

    // We need a spy for console.error as the global error handler in onRequest might log it
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(queueStatus(mockRequest as Request, mockResponse as Response))
      .rejects.toThrow('Failed to get jobs');

    expect(CiJobs.getAll).toHaveBeenCalledTimes(1);
    // Depending on how error handling is implemented, res.status might or might not be called.
    // For Firebase Functions, often an unhandled promise rejection will lead to a generic 500.
    // Let's assume for now the default Firebase error handling takes over.
    // If there was specific error handling in queueStatus, we'd test that.
    // For instance, if it caught the error and did res.status(500).send(...), we'd check for that.

    consoleErrorSpy.mockRestore();
  });

  it('should handle errors gracefully if CiBuilds.getAll fails', async () => {
    const error = new Error('Failed to get builds');
    (CiJobs.getAll as jest.Mock).mockResolvedValue([] as any); // Jobs succeed
    (CiBuilds.getAll as jest.Mock).mockRejectedValue(error);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(queueStatus(mockRequest as Request, mockResponse as Response))
      .rejects.toThrow('Failed to get builds');

    expect(CiBuilds.getAll).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });
});
