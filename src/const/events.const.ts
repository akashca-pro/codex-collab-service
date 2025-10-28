export const ClientToServerEvents = {
  CONTROL_MESSAGE: 'control-message',
} as const;

export const ServerToClientEvents = {
  CONTROL_MESSAGE: 'control-message',
  INITIAL_STATE: 'initial-state',
  ERROR: 'error',
} as const;

export const ControlMsgType = {
  DOC_UPDATE: 'doc-update',
  AWARENESS_UPDATE: 'awareness-update',
  CHANGE_LANGUAGE: 'change-language',
  LANGUAGE_CHANGED: 'language-changed', 
  USER_LEFT: 'user-left',
  END_SESSION: 'end-session',
} as const;

export type ControlMsgTypes = typeof ControlMsgType[keyof typeof ControlMsgType];

export interface ControlMessage<T = any> {
  type: ControlMsgTypes;
  payload: T;
}