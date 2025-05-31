const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    })),
    where: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
    })),
    add: jest.fn(() => Promise.resolve({ id: 'mocked-doc-id' })),
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'mocked-server-timestamp'),
  },
};

const mockAuth = {
  verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'mocked-uid' })),
};

const mockStorage = {
  bucket: jest.fn(() => ({
    file: jest.fn(() => ({
      download: jest.fn(() => Promise.resolve(['mocked-file-content'])),
      save: jest.fn(() => Promise.resolve()),
    })),
  })),
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(() => ({ // Modified
    firestore: jest.fn(() => mockFirestore), // Modified
    auth: jest.fn(() => mockAuth), // Modified
    storage: jest.fn(() => mockStorage), // Modified
  })), // Modified
  credential: {
    applicationDefault: jest.fn(() => ({})),
    cert: jest.fn(() => ({})),
  },
  firestore: jest.fn(() => mockFirestore), // Keep direct mock for static access if any
  auth: jest.fn(() => mockAuth), // Keep direct mock
  storage: jest.fn(() => mockStorage), // Keep direct mock
}));

// Original firestore mock - will be replaced by the constants above for initializeApp
// firestore: jest.fn(() => ({
//   collection: jest.fn(() => ({
//     doc: jest.fn(() => ({
//     })),
//     where: jest.fn(() => ({
//       get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
//     })),
//     add: jest.fn(() => Promise.resolve({ id: 'mocked-doc-id' })),
//   })),
//   FieldValue: {
//     serverTimestamp: jest.fn(() => 'mocked-server-timestamp'),
//   },
// })),
// auth: jest.fn(() => ({
//   verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'mocked-uid' })),
// })),
// storage: jest.fn(() => ({
//   bucket: jest.fn(() => ({
//     file: jest.fn(() => ({
//       download: jest.fn(() => Promise.resolve(['mocked-file-content'])),
//       save: jest.fn(() => Promise.resolve()),
//     })),
//   })),
// })),
// }));

jest.mock('firebase-functions', () => ({
  https: {
    onRequest: jest.fn(handler => handler),
    onCall: jest.fn(handler => handler),
  },
  logger: {
    info: jest.fn(console.info),
    error: jest.fn(console.error),
    warn: jest.fn(console.warn),
    debug: jest.fn(console.debug),
    log: jest.fn(console.log),
  },
  config: jest.fn(() => ({
    // Mock your firebase config values here if needed
  })),
  region: jest.fn(() => ({ // Add this line
    runWith: jest.fn(() => ({
      https: {
        onRequest: jest.fn(handler => handler),
        onCall: jest.fn(handler => handler),
      },
      firestore: {
        document: jest.fn(() => ({
            onCreate: jest.fn(),
            onUpdate: jest.fn(),
            onDelete: jest.fn(),
        })),
      },
      pubsub: {
        schedule: jest.fn(() => ({
          onRun: jest.fn(),
        })),
      },
    })),
  })),
  firestore: {
    document: jest.fn(() => ({
        onCreate: jest.fn(),
        onUpdate: jest.fn(),
        onDelete: jest.fn(),
    })),
  },
  pubsub: {
    schedule: jest.fn(() => ({
      onRun: jest.fn(),
    })),
  },
}));

jest.mock('firebase-functions/v2/https', () => ({
    onRequest: jest.fn(handler => handler),
}));
