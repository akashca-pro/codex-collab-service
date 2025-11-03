
export type YjsUpdate = Uint8Array;

// --- Client-to-Server Event Payloads ---


// --- Server-to-Client Event Payloads ---

/**
 * Payload sent to a client immediately after they join a session.
 * Contains the full document state and the awareness state of other users.
 * @event 'initial-state'
 */
export interface ServerInitialState {
  docUpdate: YjsUpdate;
  awarenessUpdate: YjsUpdate;
}


/**
 * Payload for an error message sent from the server.
 * @event 'error'
 */
export interface ServerError {
  message: string;
  code?: number;
}

export interface CollabUserInfo {
  id : string;
  username : string;
  firstName : string;
  avatar : string;
  isTyping: false
}
