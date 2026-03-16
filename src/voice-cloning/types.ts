export interface ClonedVoice {
  id: string;
  name: string;
  createdAt: Date;
  sampleAudioUrl?: string;
  // הגדרות מנוע קול מותאם אישית
  baseVoice: string;
  pitch: number;
  speed: number;
  bass: number;
  treble: number;
}
