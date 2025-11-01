import { ActiveSessionMetadata } from "@/types/document.types";

export const MetadataMsgType = {
  CHANGE_LANGUAGE: 'change-language',
  LANGUAGE_CHANGED: 'language-changed', 
  CHANGE_FONT : 'change-font',
  FONT_CHANGED : 'font-changed',
  TOGGLE_INTELLISENSE: 'toggle-intellisense',
  INTELLISENSE_TOGGLED: 'intellisense-toggled'
} as const;

export type MetadataMsgTypes = typeof MetadataMsgType[keyof typeof MetadataMsgType];

export interface MetadataMessage {
  type: MetadataMsgTypes;
  payload: Partial<ActiveSessionMetadata>
}

export const RunCodeMsgTypes = {
  RUNNING_CODE: 'running-code',
  RESULT_UPDATED : 'result-updated'
} as const

export type RunCodeMsgTypes = typeof RunCodeMsgTypes[keyof typeof RunCodeMsgTypes];

export interface ActiveSessionRunCodeData {
  isRunning : boolean;
  consoleMessage : string;
}

export interface RunCodeMessage {
  type : RunCodeMsgTypes
  payload : Partial<ActiveSessionRunCodeData>
}