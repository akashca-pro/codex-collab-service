import * as Y from 'yjs';

/**
 * A map holding active Y.Doc instances in memory, keyed by sessionId.
 * This allows for immediate application and broadcasting of updates
 * without needing a database roundtrip for every change.
 */
export type ActiveDocsMap = Map<string, Y.Doc>;