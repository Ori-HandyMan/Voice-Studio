export class LocalTTSEngine {
  static getVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis.getVoices();
  }

  static speak(
    text: string,
    options: {
      voiceName?: string;
      rate?: number;
      pitch?: number;
      lang?: string;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (e: any) => void;
    } = {}
  ) {
    if (!('speechSynthesis' in window)) {
      if (options.onError) options.onError(new Error("מנוע הקראה מקומי אינו נתמך בדפדפן זה."));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Determine language (default to Hebrew if Hebrew chars found)
    const hasHebrew = /[\u0590-\u05FF]/.test(text);
    utterance.lang = options.lang || (hasHebrew ? 'he-IL' : 'en-US');

    // Find requested voice or fallback to a voice matching the language
    const voices = this.getVoices();
    if (options.voiceName) {
      const selectedVoice = voices.find(v => v.name === options.voiceName || v.name.includes(options.voiceName!));
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    } else {
      // Try to find a voice for the language
      const langVoices = voices.filter(v => v.lang.startsWith(utterance.lang.split('-')[0]));
      if (langVoices.length > 0) {
        // Prefer local service if available
        const localVoice = langVoices.find(v => v.localService);
        utterance.voice = localVoice || langVoices[0];
      }
    }

    if (options.rate) utterance.rate = options.rate;
    if (options.pitch) utterance.pitch = options.pitch;

    if (options.onStart) utterance.onstart = options.onStart;
    if (options.onEnd) utterance.onend = options.onEnd;
    if (options.onError) utterance.onerror = options.onError;

    window.speechSynthesis.speak(utterance);
  }

  static stop() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
  
  static pause() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }
  
  static resume() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  }
}
