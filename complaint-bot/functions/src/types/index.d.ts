export interface User {
  id: string;
  email?: string;
  role: string;
}

export interface CallStatus {
  call_id: string;
  status: string;
  transcript: string[];
  ivr_interactions: IVRInteraction[];
  lastUpdated: Date;
}

export interface IVRInteraction {
  prompt: string;
  selected_option: string;
  timestamp: Date;
}

export interface BlandAIResponse {
  audio: Buffer;
  text: string;
  is_ivr: boolean;
  is_human: boolean;
  dtmf_key?: string;
} 