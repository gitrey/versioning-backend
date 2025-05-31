import { repoVersions } from '../repoVersions'; // Adjust if necessary
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { logger } from 'firebase-functions/v2';
import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';

// Mock the model and logger
jest.mock('../../model/repoVersionInfo');
jest.mock('firebase-functions/v2', () => ({
  ...jest.requireActual('firebase-functions/v2'), // Import and retain default exports
  logger: {
    info: jest.fn(),
    error: jest.fn(), // Mock logger.error
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
  // Mock onRequest if it's not already handled by global setup
  https: {
    onRequest: jest.fn(handler => handler),
  },
}));

describe('repoVersions API', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let sendSpy: jest.SpyInstance; // Keep this simple for now, will be actualSendSpy


  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {};
    // Setup response object with a send spy
    const actualSendSpy = jest.fn();
    mockResponse = {
      send: jest.fn((body?: any) => { // Match Express signature
        actualSendSpy(body);
        return mockResponse as Response; // Return 'this' for chaining (if any)
      })
    };
    // Re-assign sendSpy to the one that's actually part of mockResponse.send
    sendSpy = actualSendSpy; // This spy is used for expect() assertions
  });

  it('should fetch all repo version IDs and return them', async () => {
    const mockVersionIds = ['1.0.0', '1.0.1', '2.0.0-alpha'];
    (RepoVersionInfo.getAllIds as jest.Mock).mockResolvedValue(mockVersionIds);

    await repoVersions(mockRequest as Request, mockResponse as Response);

    expect(RepoVersionInfo.getAllIds).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(mockVersionIds); // Use the actual spy
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log an error and return "Oops." if fetching versions fails', async () => {
    const dbError = new Error('Database failure');
    (RepoVersionInfo.getAllIds as jest.Mock).mockRejectedValue(dbError);

    await repoVersions(mockRequest as Request, mockResponse as Response);

    expect(RepoVersionInfo.getAllIds).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(dbError);
    expect(sendSpy).toHaveBeenCalledWith('Oops.'); // Use the actual spy
  });
});
