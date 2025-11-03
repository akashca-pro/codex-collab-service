import * as Y from 'yjs';

/**
 * A map holding active Y.Doc instances in memory, keyed by sessionId.
 */
export type ActiveDocsMap = Map<string, Y.Doc>;

