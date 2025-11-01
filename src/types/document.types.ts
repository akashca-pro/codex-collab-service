import { Language } from '@/const/language.const';
import * as Y from 'yjs';

/**
 * A map holding active Y.Doc instances in memory, keyed by sessionId.
 */
export type ActiveDocsMap = Map<string, Y.Doc>;

export interface ActiveSessionMetadata {
  language: Language;
  fontSize : number;
  intelliSense : boolean;
}
export interface ActiveSessionRunCodeData {
  isRunning : boolean;
  consoleMessages : string;
}
