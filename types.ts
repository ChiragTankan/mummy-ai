
export interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface AudioProcessingRefs {
  nextStartTime: number;
  sources: Set<AudioBufferSourceNode>;
}
